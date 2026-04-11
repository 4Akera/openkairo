import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSettingsStore as useBillingSettings } from '../stores/settingsStore'
import { useBillingStore } from '../stores/billingStore'
import type { Patient, Encounter, EncounterTemplate, UserBlockTemplate } from '../types'
import { fullName, formatDateTime, cn } from '../lib/utils'
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui'
import {
  ArrowLeft, Plus, ChevronRight, Loader2, Activity, Clock,
  CheckCircle2, XCircle, LayoutTemplate, Lock, Users, Zap, ClipboardList, UserCircle,
  Search, X, DollarSign, Trash2, AlertTriangle,
} from 'lucide-react'
import PatientRecord from '../components/patient-record/PatientRecord'

export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const { user, profile, roleSlugs, can, hasRole } = useAuthStore()
  const { nameFormat } = useSettingsStore()
  const { billingEnabled } = useBillingSettings()
  const { serviceItems, fetchServiceItems, addCharge } = useBillingStore()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [visibility, setVisibility] = useState<'staff' | 'restricted' | 'private'>('staff')
  const [visibleToRoles, setVisibleToRoles] = useState<string[]>([])
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [assignError, setAssignError] = useState(false)
  const [createdForOtherName, setCreatedForOtherName] = useState<string | null>(null)
  const [physicianSearch, setPhysicianSearch] = useState('')
  const [physicianDropOpen, setPhysicianDropOpen] = useState(false)
  const [physicians, setPhysicians] = useState<{ id: string; full_name: string }[]>([])
  const [mobileTab, setMobileTab] = useState<'encounters' | 'record'>('encounters')

  // Quick charge
  const [quickChargeOpen, setQuickChargeOpen]   = useState(false)
  const [quickChargeDesc, setQuickChargeDesc]   = useState('')
  const [quickChargePrice, setQuickChargePrice] = useState('')
  const [quickChargeSaving, setQuickChargeSaving] = useState(false)

  // Admin: encounter delete
  const [encToDelete, setEncToDelete] = useState<Encounter | null>(null)
  const [deletingEnc, setDeletingEnc] = useState(false)

  // Admin: patient delete
  const [patientDeleteOpen, setPatientDeleteOpen] = useState(false)
  const [patientDeleteConfirm, setPatientDeleteConfirm] = useState('')
  const [deletingPatient, setDeletingPatient] = useState(false)

  useEffect(() => {
    if (billingEnabled && can('billing.charge')) fetchServiceItems()
  }, [billingEnabled, can, fetchServiceItems])

  // Templates
  const [templates, setTemplates] = useState<EncounterTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EncounterTemplate | null>(null)
  // All user content templates grouped by definition_id
  const [allContentTpls, setAllContentTpls] = useState<Record<string, UserBlockTemplate[]>>({})
  const [loadingContentTpls, setLoadingContentTpls] = useState(false)
  // Per-block content overrides for the current encounter creation: definition_id → template id or 'blank'
  const [blockContentOverrides, setBlockContentOverrides] = useState<Record<string, string | 'blank'>>({})

  const setBlockOverride = (definitionId: string, value: string | 'blank' | null) => {
    setBlockContentOverrides(prev => {
      const next = { ...prev }
      if (value === null) delete next[definitionId]
      else next[definitionId] = value
      return next
    })
  }

  // Derive auto-apply defaults from allContentTpls for quick lookup
  const defaultContentTpls: Record<string, UserBlockTemplate> = {}
  for (const [defId, tpls] of Object.entries(allContentTpls)) {
    const d = tpls.find(t => t.is_default)
    if (d) defaultContentTpls[defId] = d
  }

  const fetchData = useCallback(async () => {
    if (!patientId) return
    setLoading(true)

    const [{ data: pt }, encRes, { data: tmpl }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).single(),
      supabase
        .from('encounters')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      supabase.from('encounter_templates').select('*').order('is_universal', { ascending: false }),
    ])

    if (pt) setPatient(pt)

    if (encRes.data) {
      // Batch-fetch creator + assigned-to names from profiles
      const allIds = [...new Set([
        ...encRes.data.map(e => e.created_by),
        ...encRes.data.map(e => e.assigned_to),
      ].filter(Boolean))]
      let profileMap: Record<string, string> = {}
      if (allIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allIds)
        if (profs) {
          for (const p of profs) profileMap[p.id] = p.full_name
        }
      }
      setEncounters(
        encRes.data.map(e => ({
          ...e,
          created_profile: e.created_by ? { full_name: profileMap[e.created_by] ?? null } : null,
          assigned_profile: e.assigned_to ? { full_name: profileMap[e.assigned_to] ?? null } : null,
        })) as Encounter[],
      )
    }

    if (tmpl) {
      // Filter universal templates by role visibility (same logic as AddBlockMenu)
      const visible = (tmpl as EncounterTemplate[]).filter(
        (t) =>
          !t.is_universal ||
          t.visible_to_roles.length === 0 ||
          t.visible_to_roles.some((r) => roleSlugs.includes(r)),
      )
      setTemplates(visible)
    }
    setLoading(false)
  }, [patientId, roleSlugs])

  useEffect(() => { fetchData() }, [fetchData])

  const isAdmin = hasRole('admin')
  // Who can open a new encounter
  const canCreateEncounter = hasRole('physician') || hasRole('nurse') || hasRole('receptionist') || hasRole('admin')
  // Everyone except admin must assign a physician (physician auto-assigns to self)
  const requiresAssignment = !hasRole('admin')

  const handleDeleteEncounter = async (enc: Encounter) => {
    setDeletingEnc(true)
    await supabase.from('encounters').delete().eq('id', enc.id)
    setEncounters(prev => prev.filter(e => e.id !== enc.id))
    setEncToDelete(null)
    setDeletingEnc(false)
  }

  const handleDeletePatient = async () => {
    if (!patient) return
    setDeletingPatient(true)
    await supabase.from('patients').delete().eq('id', patient.id)
    setDeletingPatient(false)
    setPatientDeleteOpen(false)
    navigate('/')
  }

  const openDialog = () => {
    setTitle('')
    setSelectedTemplate(null)
    setVisibility('private')
    setVisibleToRoles([])
    setAssignedTo(roleSlugs.includes('physician') && user ? user.id : '')
    setAssignError(false)
    setPhysicianSearch('')
    setPhysicianDropOpen(false)
    setBlockContentOverrides({})
    setDialogOpen(true)
    if (!user) return
    setLoadingContentTpls(true)
    // Fetch physicians + content templates in parallel
    Promise.all([
      supabase
        .from('user_block_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
      supabase.rpc('get_physicians_list'),
    ]).then(([tplRes, physRes]) => {
      const map: Record<string, UserBlockTemplate[]> = {}
      for (const t of tplRes.data ?? []) {
        if (!map[t.definition_id]) map[t.definition_id] = []
        map[t.definition_id].push(t as UserBlockTemplate)
      }
      setAllContentTpls(map)
      setLoadingContentTpls(false)
      setPhysicians((physRes.data ?? []) as { id: string; full_name: string }[])
    })
  }

  // Pre-fill visibility and title from selected template defaults
  const handleSelectTemplate = (t: EncounterTemplate | null) => {
    setSelectedTemplate(t)
    setBlockContentOverrides({})
    if (t) {
      setVisibility(t.default_visibility ?? 'staff')
      setVisibleToRoles(t.default_visible_to_roles ?? [])
      setTitle(prev => prev.trim() === '' ? t.name : prev)
    } else {
      // Cleared — wipe the title only if it still matches a template name
      setTitle(prev =>
        templates.some(tmpl => tmpl.name === prev) ? '' : prev
      )
    }
  }

  const handleCreate = async () => {
    if (!patientId || !user) return
    // Nurse / receptionist must assign to a physician before creating
    if (requiresAssignment && !assignedTo) {
      setAssignError(true)
      return
    }
    setAssignError(false)
    setCreating(true)

    // Pre-generate the ID so we can reference it for block seeding and
    // navigation without relying on .select() (which RLS may block when the
    // current user creates a private encounter assigned to someone else).
    const newEncounterId = crypto.randomUUID()

    const { error } = await supabase
      .from('encounters')
      .insert({
        id: newEncounterId,
        patient_id: patientId,
        title: title.trim() || null,
        status: 'open',
        visibility,
        visible_to_roles: visibility === 'restricted' ? visibleToRoles : [],
        assigned_to: assignedTo || null,
        created_by: user.id,
      })

    if (error) {
      setCreating(false)
      return
    }

    // Apply template blocks if one was selected
    if (selectedTemplate && selectedTemplate.blocks.length > 0) {
      const blockRows = selectedTemplate.blocks.map((b) => {
        let content: Record<string, unknown> = {}
        if (b.definition_id) {
          const override = blockContentOverrides[b.definition_id]
          if (override && override !== 'blank') {
            // Explicit user choice: find the selected content template
            const tpl = allContentTpls[b.definition_id]?.find(t => t.id === override)
            if (tpl) content = tpl.content as Record<string, unknown>
          } else if (!override) {
            // No explicit override: fall back to auto-apply default
            const defTpl = defaultContentTpls[b.definition_id]
            if (defTpl) content = defTpl.content as Record<string, unknown>
          }
          // override === 'blank' → leave content as {}
        }
        return {
          encounter_id: newEncounterId,
          type: b.slug,
          content,
          sequence_order: b.sort_order,
          author_name: profile?.full_name || user.email || '',
          definition_id: b.definition_id ?? null,
          is_template_seed: true,
          is_pinned: b.pin,
          created_by: user.id,
        }
      })
      await supabase.from('blocks').insert(blockRows)
    }

    const canOpenNow = canNavigateEncounter(
      { visibility, assigned_to: assignedTo || null, created_by: user.id, visible_to_roles: visibleToRoles },
      user.id,
      roleSlugs,
      hasRole,
      can as (p: string) => boolean,
    )

    if (canOpenNow) {
      navigate(`/patients/${patientId}/encounters/${newEncounterId}`)
    } else {
      setDialogOpen(false)
      await fetchData()
      // Show success note when the encounter was created for another doctor
      if (visibility === 'private' && assignedTo && assignedTo !== user.id) {
        const assignedName = physicians.find(p => p.id === assignedTo)?.full_name ?? 'the assigned physician'
        setCreatedForOtherName(assignedName)
        setTimeout(() => setCreatedForOtherName(null), 6000)
      }
    }
    setCreating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <XCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Patient not found</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patients
        </Button>
      </div>
    )
  }

  const open = encounters.filter(e => e.status === 'open')
  const closed = encounters.filter(e => e.status === 'closed')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="min-h-10 min-w-10 shrink-0" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {patient.first_name[0]}{nameFormat === 'three' && patient.middle_name ? patient.middle_name[0] : patient.last_name[0]}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate">{fullName(patient, nameFormat)}</h1>
            <p className="text-xs text-muted-foreground font-mono">{patient.mrn}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {billingEnabled && can('billing.charge') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setQuickChargeDesc(''); setQuickChargePrice(''); setQuickChargeOpen(true) }}
              className="shrink-0 gap-1"
              title="Quick charge"
            >
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Charge</span>
            </Button>
          )}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setPatientDeleteConfirm(''); setPatientDeleteOpen(true) }}
                  className="shrink-0 gap-1.5 text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800 border border-rose-600 dark:border-rose-700 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-medium">Delete Patient</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
                <span className="font-semibold block">Admin only</span>
                Permanently delete this patient and all their data
              </TooltipContent>
            </Tooltip>
          )}
          {canCreateEncounter && (
            <Button size="sm" onClick={openDialog} className="shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Encounter</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b bg-card shrink-0">
        <button
          onClick={() => setMobileTab('encounters')}
            className={cn(
            'flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-3 text-sm font-medium border-b-2 transition-colors',
            mobileTab === 'encounters'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground',
          )}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Encounters
          {encounters.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{encounters.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setMobileTab('record')}
            className={cn(
            'flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-3 text-sm font-medium border-b-2 transition-colors',
            mobileTab === 'record'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground',
          )}
        >
          <UserCircle className="h-3.5 w-3.5" />
          Patient Info
        </button>
      </div>

      {/* Two-pane body: encounters list left, patient record right */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Encounters list */}
        <div className={cn(
          'flex-1 overflow-hidden',
          mobileTab !== 'encounters' && 'hidden md:block',
        )}>
          <ScrollArea className="h-full">
            <div className="px-4 sm:px-6 py-4 sm:py-5 max-w-2xl">
              {/* Success note: private encounter created for another doctor */}
              {createdForOtherName && (
                <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs leading-snug">
                    Encounter created and assigned to <span className="font-medium">{createdForOtherName}</span>. It's private, so only they can view it.
                  </p>
                </div>
              )}
              {encounters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <Activity className="h-10 w-10 opacity-20" />
                  <p className="text-sm">No encounters yet for this patient</p>
                  {canCreateEncounter && (
                    <Button size="sm" onClick={openDialog}>
                      <Plus className="h-4 w-4" />
                      Start First Encounter
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {open.length > 0 && (
                    <section>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Open ({open.length})
                      </p>
                      <div className="space-y-2">
                        {open.map(enc => (
                          <EncounterCard
                            key={enc.id}
                            encounter={enc}
                            canNavigate={canNavigateEncounter(enc, user?.id, roleSlugs, hasRole, can as (p: string) => boolean)}
                            onNavigate={() => navigate(`/patients/${patientId}/encounters/${enc.id}`)}
                            isAdmin={isAdmin}
                            onDelete={() => setEncToDelete(enc)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {closed.length > 0 && (
                    <section>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Closed ({closed.length})
                      </p>
                      <div className="space-y-2">
                        {closed.map(enc => (
                          <EncounterCard
                            key={enc.id}
                            encounter={enc}
                            canNavigate={canNavigateEncounter(enc, user?.id, roleSlugs, hasRole, can as (p: string) => boolean)}
                            onNavigate={() => navigate(`/patients/${patientId}/encounters/${enc.id}`)}
                            isAdmin={isAdmin}
                            onDelete={() => setEncToDelete(enc)}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Patient Record panel */}
        <div className={cn(
          'w-full md:w-80 shrink-0 overflow-hidden',
          mobileTab !== 'record' && 'hidden md:block',
        )}>
          <PatientRecord
            patient={patient}
            onPatientUpdate={setPatient}
          />
        </div>
      </div>

      {/* New Encounter Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md h-[90vh] !flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>New Encounter</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-4 mt-2 pb-2">

            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title (optional)</Label>
              <Input
                placeholder="e.g. Follow-up, Initial consultation…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                autoFocus
              />
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {([
                  { value: 'staff',      label: 'All Staff',   desc: 'Visible to everyone' },
                  { value: 'restricted', label: 'Restricted',  desc: 'Selected roles only' },
                  { value: 'private',    label: 'Private',     desc: 'Only me or assigned to' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-lg border p-2 text-center transition-colors',
                      visibility === opt.value
                        ? 'border-primary/50 bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    <span className="text-xs font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {/* Role picker for restricted */}
              {visibility === 'restricted' && (
                <div className="pt-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground">Accessible to:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['physician', 'nurse', 'receptionist', 'admin'].map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() =>
                          setVisibleToRoles(prev =>
                            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
                          )
                        }
                        className={cn(
                          'text-[11px] px-2 py-1 rounded-md border transition-colors capitalize',
                          visibleToRoles.includes(role)
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
            </div>

            {/* Assign to physician */}
            {physicians.length > 0 && (
              <div className="space-y-1.5">
                <Label className={assignError ? 'text-destructive' : ''}>
                  Assign to{' '}
                  {requiresAssignment
                    ? <span className="text-destructive font-normal">(required)</span>
                    : <span className="text-muted-foreground font-normal">(optional)</span>}
                </Label>
                <div className="relative">
                  {/* Selected display / search input */}
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search physician…"
                      value={physicianDropOpen
                        ? physicianSearch
                        : (physicians.find(p => p.id === assignedTo)?.full_name ?? '')}
                      onFocus={() => {
                        setPhysicianSearch('')
                        setPhysicianDropOpen(true)
                      }}
                      onChange={e => setPhysicianSearch(e.target.value)}
                      className={cn(
                        'w-full text-xs rounded-lg border bg-background pl-8 pr-7 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
                        assignError && !assignedTo ? 'border-destructive focus:ring-destructive' : 'border-border',
                      )}
                    />
                    {assignedTo && !physicianDropOpen && !requiresAssignment && (
                      <button
                        type="button"
                        onClick={() => { setAssignedTo(''); setPhysicianSearch('') }}
                        className="absolute right-2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown */}
                  {physicianDropOpen && (
                    <>
                      <div className="fixed inset-0 z-[90]" onClick={() => setPhysicianDropOpen(false)} />
                      <div className="absolute z-[100] mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                        <div className="max-h-48 overflow-y-auto">
                          {/* Clear option — hidden for roles that must assign */}
                          {!requiresAssignment && (
                            <button
                              type="button"
                              onClick={() => { setAssignedTo(''); setPhysicianDropOpen(false) }}
                              className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent/60 transition-colors italic"
                            >
                              — No assignment —
                            </button>
                          )}
                          {physicians
                            .filter(p => p.full_name.toLowerCase().includes(physicianSearch.toLowerCase()))
                            .map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { setAssignedTo(p.id); setAssignError(false); setPhysicianDropOpen(false) }}
                                className={cn(
                                  'w-full px-3 py-2 text-left text-xs hover:bg-accent/60 transition-colors flex items-center gap-2',
                                  assignedTo === p.id && 'bg-accent/40 font-medium',
                                )}
                              >
                                <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {p.full_name}
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
                {assignError && !assignedTo && (
                  <p className="text-[11px] text-destructive flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    A physician must be assigned before creating this encounter.
                  </p>
                )}
              </div>
            )}

            {/* Template picker */}
            <div className="space-y-2">
              <Label>Template <span className="text-muted-foreground font-normal">(optional)</span></Label>

              {templates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic px-1">
                  No templates available — start blank or ask an admin to create templates.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {/* No template option */}
                  <button
                    onClick={() => handleSelectTemplate(null)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-colors',
                      selectedTemplate === null
                        ? 'border-primary/50 bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    <div className="h-6 w-6 rounded flex items-center justify-center bg-muted shrink-0">
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-xs">Blank — no template</span>
                  </button>

                  {/* Template options */}
                  {templates.map((t) => {
                    const preFilled = t.blocks.filter(
                      b => b.definition_id && !!defaultContentTpls[b.definition_id],
                    )
                    return (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(t)}
                      className={cn(
                        'w-full flex items-start gap-2 p-2 rounded-lg border text-left transition-colors',
                        selectedTemplate?.id === t.id
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border hover:border-primary/30',
                      )}
                    >
                      <div className="h-6 w-6 rounded flex items-center justify-center bg-indigo-100 shrink-0 mt-0.5">
                        <LayoutTemplate className="w-3 h-3 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium">{t.name}</p>
                          {t.is_universal && (
                            <span className="text-[9px] px-1 py-0 rounded bg-indigo-50 border border-indigo-200 text-indigo-600">Standard</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {t.blocks.length} block{t.blocks.length !== 1 ? 's' : ''}
                          {t.blocks.filter(b => b.pin).length > 0 &&
                            ` · ${t.blocks.filter(b => b.pin).length} pinned`}
                          {t.default_visibility && t.default_visibility !== 'staff' &&
                            ` · ${t.default_visibility}`}
                        </p>
                        {!loadingContentTpls && preFilled.length > 0 && (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
                            <Zap className="w-2.5 h-2.5 shrink-0" />
                            {preFilled.length === t.blocks.length
                              ? 'All blocks pre-filled from your templates'
                              : `${preFilled.length} block${preFilled.length !== 1 ? 's' : ''} pre-filled from your templates`}
                          </p>
                        )}
                      </div>
                    </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Per-block content template picker — shown when a template with eligible blocks is selected */}
            {selectedTemplate && !loadingContentTpls && (() => {
              const eligibleBlocks = selectedTemplate.blocks.filter(
                b => b.definition_id && (allContentTpls[b.definition_id]?.length ?? 0) > 0,
              )
              if (eligibleBlocks.length === 0) return null
              return (
                <div className="space-y-2">
                  <Label>Block Content <span className="text-muted-foreground font-normal text-[11px]">(optional overrides)</span></Label>
                  <div className="space-y-1.5">
                    {eligibleBlocks.map(b => {
                      const tpls = allContentTpls[b.definition_id!] ?? []
                      const override = blockContentOverrides[b.definition_id!]
                      const autoDefault = tpls.find(t => t.is_default)
                      return (
                        <div key={b.slug} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                          <p className="text-xs font-medium flex-1 min-w-0 truncate">{b.slug}</p>
                          <select
                            value={override ?? '__default__'}
                            onChange={e => {
                              const v = e.target.value
                              setBlockOverride(b.definition_id!, v === '__default__' ? null : v)
                            }}
                            className="text-[11px] rounded border border-border bg-background px-1.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="__default__">
                              {autoDefault ? `⚡ Auto (${autoDefault.name})` : 'Blank (no default)'}
                            </option>
                            <option value="blank">Blank</option>
                            {tpls.map(tpl => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name}{tpl.is_default ? ' ⚡' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Open Encounter
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── Quick Charge Dialog ── */}
      <Dialog open={quickChargeOpen} onOpenChange={setQuickChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Quick Charge — {patient?.first_name} {patient?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {serviceItems.length > 0 && (
              <div className="space-y-1.5">
                <Label>Quick pick</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {serviceItems.filter(s => s.active).slice(0, 10).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setQuickChargeDesc(s.name); setQuickChargePrice(String(s.default_price)) }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                        quickChargeDesc === s.name
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-primary/30',
                      )}
                    >
                      {s.name} — {s.default_price.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={quickChargeDesc}
                onChange={e => setQuickChargeDesc(e.target.value)}
                placeholder="Charge description"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                value={quickChargePrice}
                onChange={e => setQuickChargePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickChargeOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!patient || !quickChargeDesc || !quickChargePrice) return
                  setQuickChargeSaving(true)
                  await addCharge({
                    patient_id:  patient.id,
                    description: quickChargeDesc,
                    quantity:    1,
                    unit_price:  parseFloat(quickChargePrice) || 0,
                    source:      'manual',
                  })
                  setQuickChargeSaving(false)
                  setQuickChargeOpen(false)
                }}
                disabled={quickChargeSaving || !quickChargeDesc || !quickChargePrice}
              >
                {quickChargeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                Add Charge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Delete encounter confirmation */}
      <Dialog open={!!encToDelete} onOpenChange={(o) => { if (!o) setEncToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <div className="h-7 w-7 rounded-full bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </div>
              Permanently delete encounter?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">This cannot be undone.</p>
                <p className="text-xs text-rose-600/80 dark:text-rose-400/70">All blocks, attachments and history within this encounter will be permanently removed.</p>
              </div>
            </div>
            {encToDelete && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Encounter</p>
                <p className="text-sm font-semibold">{encToDelete.title ?? `#${encToDelete.id.slice(0, 8).toUpperCase()}`}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEncToDelete(null)} disabled={deletingEnc}>Cancel</Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 text-white border-0 gap-1.5 shadow-sm"
                disabled={deletingEnc}
                onClick={() => encToDelete && handleDeleteEncounter(encToDelete)}
              >
                {deletingEnc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete forever
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Delete patient confirmation */}
      <Dialog open={patientDeleteOpen} onOpenChange={(o) => { if (!o) setPatientDeleteOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <div className="h-7 w-7 rounded-full bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </div>
              Permanently delete patient?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">This cannot be undone.</p>
                <p className="text-xs text-rose-600/80 dark:text-rose-400/70">All encounters, blocks, and clinical data for this patient will be permanently deleted.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">
                Type{' '}
                <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-foreground">{patient?.last_name}</span>
                {' '}to confirm
              </Label>
              <Input
                value={patientDeleteConfirm}
                onChange={e => setPatientDeleteConfirm(e.target.value)}
                placeholder={patient?.last_name}
                className="border-rose-200 dark:border-rose-800 focus-visible:ring-rose-400"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPatientDeleteOpen(false)} disabled={deletingPatient}>Cancel</Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 text-white border-0 gap-1.5 shadow-sm disabled:opacity-40"
                disabled={deletingPatient || patientDeleteConfirm.trim().toLowerCase() !== (patient?.last_name ?? '').toLowerCase()}
                onClick={handleDeletePatient}
              >
                {deletingPatient ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete patient forever
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function canNavigateEncounter(
  enc: { visibility: string; assigned_to: string | null; created_by: string | null; visible_to_roles?: string[] },
  userId: string | undefined,
  roleSlugs: string[],
  hasRole: (slug: string) => boolean,
  canPerm?: (p: string) => boolean,
): boolean {
  if (canPerm && !canPerm('block.add')) return false
  // Staff-visibility encounters are open to all clinical staff
  if (enc.visibility === 'staff') return true
  // Admin can always enter any encounter
  if (hasRole('admin')) return true
  // Only the assigned physician has access to private/restricted encounters
  if (enc.assigned_to && enc.assigned_to === userId) return true
  // Restricted: role-list check (but only if also assigned — handled above — or in the role list)
  if (enc.visibility === 'restricted') {
    return enc.visible_to_roles?.some(r => roleSlugs.includes(r)) ?? false
  }
  return false
}

function EncounterCard({
  encounter,
  onNavigate,
  canNavigate,
  isAdmin,
  onDelete,
}: {
  encounter: Encounter
  onNavigate: () => void
  canNavigate: boolean
  isAdmin?: boolean
  onDelete?: () => void
}) {
  const visIcon = encounter.visibility === 'private'
    ? <Lock className="h-3 w-3" />
    : encounter.visibility === 'restricted'
    ? <Users className="h-3 w-3" />
    : null

  return (
    <div
      className={cn(
        'border rounded-lg p-4 flex items-center gap-3 min-w-0 transition-colors',
        canNavigate
          ? 'cursor-pointer hover:bg-accent/50'
          : 'cursor-default opacity-60',
      )}
      onClick={canNavigate ? onNavigate : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`h-2 w-2 rounded-full shrink-0 ${encounter.status === 'open' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        <div className="min-w-0 flex-1 pr-1">
          <div className="flex items-start gap-1.5">
            <p
              className="text-sm font-medium leading-snug break-words"
              title={encounter.title ?? undefined}
            >
              {encounter.title ?? `Encounter #${encounter.id.slice(0, 8).toUpperCase()}`}
            </p>
            {visIcon && (
              <span className="text-muted-foreground opacity-60 shrink-0 mt-0.5" title={encounter.visibility}>
                {visIcon}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {formatDateTime(encounter.created_at)}
            {encounter.created_profile?.full_name && (
              <span className="ml-1.5 opacity-70">· {encounter.created_profile.full_name}</span>
            )}
            {encounter.assigned_profile?.full_name && (
              <span className="ml-1.5 text-primary/70">→ {encounter.assigned_profile.full_name}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={encounter.status === 'open' ? 'success' : 'muted'}>
          {encounter.status === 'open' ? 'Open' : 'Closed'}
        </Badge>
        {isAdmin && onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="h-7 w-7 rounded-md flex items-center justify-center text-rose-400 hover:text-white hover:bg-rose-600 dark:hover:bg-rose-700 border border-transparent hover:border-rose-600 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs text-center max-w-[160px]">
              <span className="font-semibold block">Admin only</span>
              Permanently delete encounter
            </TooltipContent>
          </Tooltip>
        )}
        {canNavigate
          ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
          : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  )
}
