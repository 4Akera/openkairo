import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Patient, Encounter, EncounterTemplate } from '../types'
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
} from '../components/ui'
import {
  ArrowLeft, Plus, ChevronRight, Loader2, Activity, Clock,
  CheckCircle2, XCircle, LayoutTemplate, Lock, Users, Globe,
} from 'lucide-react'
import PatientRecord from '../components/patient-record/PatientRecord'

export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const { user, profile, roleSlugs } = useAuthStore()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [visibility, setVisibility] = useState<'staff' | 'restricted' | 'private'>('staff')
  const [visibleToRoles, setVisibleToRoles] = useState<string[]>([])

  // Templates
  const [templates, setTemplates] = useState<EncounterTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EncounterTemplate | null>(null)

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
      // Batch-fetch creator names from profiles (profiles.id = auth.users.id)
      const creatorIds = [...new Set(encRes.data.map(e => e.created_by).filter(Boolean))]
      let profileMap: Record<string, string> = {}
      if (creatorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds)
        if (profs) {
          for (const p of profs) profileMap[p.id] = p.full_name
        }
      }
      setEncounters(
        encRes.data.map(e => ({
          ...e,
          created_profile: e.created_by ? { full_name: profileMap[e.created_by] ?? null } : null,
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

  const openDialog = () => {
    setTitle('')
    setSelectedTemplate(null)
    setVisibility('staff')
    setVisibleToRoles([])
    setDialogOpen(true)
  }

  // Pre-fill visibility and title from selected template defaults
  const handleSelectTemplate = (t: EncounterTemplate | null) => {
    setSelectedTemplate(t)
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
    setCreating(true)

    const { data, error } = await supabase
      .from('encounters')
      .insert({
        patient_id: patientId,
        title: title.trim() || null,
        status: 'open',
        visibility,
        visible_to_roles: visibility === 'restricted' ? visibleToRoles : [],
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !data) {
      setCreating(false)
      return
    }

    // Apply template blocks if one was selected
    if (selectedTemplate && selectedTemplate.blocks.length > 0) {
      const blockRows = selectedTemplate.blocks.map((b) => ({
        encounter_id: data.id,
        type: b.slug,
        content: {},
        sequence_order: b.sort_order,
        author_name: profile?.full_name || user.email || '',
        definition_id: b.definition_id ?? null,
        is_template_seed: true,
        is_pinned: b.pin,
        created_by: user.id,
        portal_visible: true,
      }))
      await supabase.from('blocks').insert(blockRows)
    }

    navigate(`/patients/${patientId}/encounters/${data.id}`)
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
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            {patient.first_name[0]}{patient.last_name[0]}
          </div>
          <div>
            <h1 className="text-base font-semibold">{fullName(patient)}</h1>
            <p className="text-xs text-muted-foreground font-mono">{patient.mrn}</p>
          </div>
        </div>
        <Button size="sm" onClick={openDialog}>
          <Plus className="h-4 w-4" />
          New Encounter
        </Button>
      </div>

      {/* Two-pane body: encounters list left, patient record right */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Encounters list */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-6 py-5 max-w-2xl">
              {encounters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <Activity className="h-10 w-10 opacity-20" />
                  <p className="text-sm">No encounters yet for this patient</p>
                  <Button size="sm" onClick={openDialog}>
                    <Plus className="h-4 w-4" />
                    Start First Encounter
                  </Button>
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
                            onNavigate={() => navigate(`/patients/${patientId}/encounters/${enc.id}`)}
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
                            onNavigate={() => navigate(`/patients/${patientId}/encounters/${enc.id}`)}
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
        <div className="w-80 shrink-0 overflow-hidden">
          <PatientRecord
            patient={patient}
            onPatientUpdate={setPatient}
          />
        </div>
      </div>

      {/* New Encounter Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Encounter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

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
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: 'staff',      label: 'All Staff',   desc: 'Visible to everyone' },
                  { value: 'restricted', label: 'Restricted',  desc: 'Selected roles only' },
                  { value: 'private',    label: 'Private',     desc: 'Only me' },
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
                  {templates.map((t) => (
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
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Open Encounter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EncounterCard({
  encounter,
  onNavigate,
}: {
  encounter: Encounter
  onNavigate: () => void
}) {
  const visIcon = encounter.visibility === 'private'
    ? <Lock className="h-3 w-3" />
    : encounter.visibility === 'restricted'
    ? <Users className="h-3 w-3" />
    : null

  return (
    <div
      className="border rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onNavigate}
    >
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full shrink-0 ${encounter.status === 'open' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">
              {encounter.title ?? `Encounter #${encounter.id.slice(0, 8).toUpperCase()}`}
            </p>
            {visIcon && (
              <span className="text-muted-foreground opacity-60" title={encounter.visibility}>
                {visIcon}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(encounter.created_at)}
            {encounter.created_profile?.full_name && (
              <span className="ml-1.5 opacity-70">· {encounter.created_profile.full_name}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={encounter.status === 'open' ? 'success' : 'muted'}>
          {encounter.status === 'open' ? 'Open' : 'Closed'}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
