import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { Medication, MedicationHistory, DatePrecision } from '../../types'
import { formatDateWithPrecision, formatDateTime } from '../../lib/utils'
import {
  Badge,
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui'
import { ClinicalDatePicker } from '../ui/ClinicalDatePicker'
import { Plus, Edit2, XCircle, History, Loader2, Pill, RotateCcw } from 'lucide-react'
import { differenceInDays, differenceInMonths, differenceInYears, parseISO } from 'date-fns'

interface Props {
  patientId: string
}

const emptyForm = {
  medication_name: '',
  dosage: '',
  frequency: '',
  route: '',
  start_date: null as string | null,
  start_date_precision: 'full' as DatePrecision,
  prescriber: '',
  notes: '',
}

type FormMode = 'add' | 'edit'

const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhaled', 'Sublingual', 'Rectal', 'Other']
const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Every 6h', 'Every 8h', 'Every 12h', 'As needed (PRN)', 'Once weekly', 'Other']

export default function MedicationList({ patientId }: Props) {
  const { user } = useAuthStore()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('add')
  const [selected, setSelected] = useState<Medication | null>(null)
  const [history, setHistory] = useState<MedicationHistory[]>([])
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadMeds = useCallback(async () => {
    const { data, error } = await supabase
      .from('patient_medications')
      .select('*, created_profile:profiles!created_by(full_name), updated_profile:profiles!updated_by(full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
    if (error) {
      const { data: basic } = await supabase
        .from('patient_medications')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      setMedications((basic ?? []) as Medication[])
    } else {
      setMedications((data ?? []) as Medication[])
    }
    setLoading(false)
  }, [patientId])

  useEffect(() => { loadMeds() }, [loadMeds])

  const openAdd = () => {
    setMode('add')
    setForm(emptyForm)
    setSelected(null)
    setFormOpen(true)
  }

  const openEdit = (m: Medication) => {
    setMode('edit')
    setSelected(m)
    setForm({
      medication_name: m.medication_name,
      dosage: m.dosage ?? '',
      frequency: m.frequency ?? '',
      route: m.route ?? '',
      start_date: m.start_date ?? null,
      start_date_precision: m.start_date_precision ?? 'full',
      prescriber: m.prescriber ?? '',
      notes: m.notes ?? '',
    })
    setFormOpen(true)
  }

  const openHistory = async (m: Medication) => {
    setSelected(m)
    const { data } = await supabase
      .from('patient_medication_history')
      .select('*')
      .eq('medication_id', m.id)
      .order('changed_at', { ascending: false })
    setHistory(data ?? [])
    setHistoryOpen(true)
  }

  const handleSave = async () => {
    if (!user || !form.medication_name.trim()) return
    setSaving(true)

    if (mode === 'add') {
      const { error } = await supabase.from('patient_medications').insert({
        patient_id: patientId,
        medication_name: form.medication_name,
        dosage: form.dosage || null,
        frequency: form.frequency || null,
        route: form.route || null,
        start_date: form.start_date || null,
        start_date_precision: form.start_date_precision,
        prescriber: form.prescriber || null,
        notes: form.notes || null,
        created_by: user.id,
      })
      if (!error) { setFormOpen(false); loadMeds() }
    } else if (selected) {
      await supabase.from('patient_medication_history').insert({
        medication_id: selected.id,
        snapshot: selected,
        changed_by: user.id,
      })
      const { error } = await supabase
        .from('patient_medications')
        .update({
          medication_name: form.medication_name,
          dosage: form.dosage || null,
          frequency: form.frequency || null,
          route: form.route || null,
          start_date: form.start_date || null,
          start_date_precision: form.start_date_precision,
          prescriber: form.prescriber || null,
          notes: form.notes || null,
          updated_by: user.id,
        })
        .eq('id', selected.id)
      if (!error) { setFormOpen(false); loadMeds() }
    }
    setSaving(false)
  }

  const handleDiscontinue = async (m: Medication) => {
    if (!user) return
    await supabase.from('patient_medication_history').insert({
      medication_id: m.id,
      snapshot: m,
      changed_by: user.id,
    })
    await supabase
      .from('patient_medications')
      .update({ status: 'discontinued', end_date: new Date().toISOString().split('T')[0], updated_by: user.id })
      .eq('id', m.id)
    loadMeds()
  }

  const handleReinstate = async (m: Medication) => {
    if (!user) return
    await supabase.from('patient_medication_history').insert({
      medication_id: m.id,
      snapshot: m,
      changed_by: user.id,
    })
    await supabase
      .from('patient_medications')
      .update({ status: 'active', end_date: null, updated_by: user.id })
      .eq('id', m.id)
    loadMeds()
  }

  const active = medications.filter(m => m.status === 'active')
  const discontinued = medications.filter(m => m.status === 'discontinued')

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Medications ({active.length} active)
          </span>
          <Button variant="ghost" size="icon-sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : medications.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-1">No medications recorded</p>
        ) : (
          <div className="space-y-1">
            {active.map(m => (
              <MedRow key={m.id} med={m} onEdit={() => openEdit(m)} onDiscontinue={() => handleDiscontinue(m)} onHistory={() => openHistory(m)} />
            ))}
            {discontinued.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-1.5 pb-0.5 uppercase tracking-wide font-medium">Discontinued</p>
                {discontinued.map(m => (
                  <MedRow key={m.id} med={m} onEdit={() => openEdit(m)} onReinstate={() => handleReinstate(m)} onHistory={() => openHistory(m)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'add' ? 'Add Medication' : 'Edit Medication'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Medication name *</Label>
              <Input
                placeholder="e.g. Lisinopril, Metformin 500mg"
                value={form.medication_name}
                onChange={e => setForm(f => ({ ...f, medication_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Dosage</Label>
                <Input placeholder="e.g. 10mg" value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Route</Label>
                <Select value={form.route} onValueChange={v => setForm(f => ({ ...f, route: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <ClinicalDatePicker
                value={form.start_date}
                precision={form.start_date_precision}
                onChange={(iso, prec) =>
                  setForm(f => ({
                    ...f,
                    start_date: iso,
                    start_date_precision: prec ?? 'full',
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Prescriber</Label>
              <Input placeholder="Dr. Name" value={form.prescriber} onChange={e => setForm(f => ({ ...f, prescriber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.medication_name.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === 'add' ? 'Add Medication' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Trail · {selected?.medication_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No changes recorded yet</p>
            ) : (
              <div className="space-y-3 py-1">
                {history.map(h => (
                  <div key={h.id} className="border rounded-md p-3 space-y-1 text-xs">
                    <p className="text-muted-foreground">{formatDateTime(h.changed_at)}</p>
                    <div className="space-y-0.5">
                      <p><span className="text-muted-foreground">Medication:</span> {h.snapshot.medication_name}</p>
                      {h.snapshot.dosage && <p><span className="text-muted-foreground">Dosage:</span> {h.snapshot.dosage}</p>}
                      {h.snapshot.frequency && <p><span className="text-muted-foreground">Frequency:</span> {h.snapshot.frequency}</p>}
                      {h.snapshot.route && <p><span className="text-muted-foreground">Route:</span> {h.snapshot.route}</p>}
                      <p><span className="text-muted-foreground">Status:</span> {h.snapshot.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MedRow({
  med,
  onEdit,
  onDiscontinue,
  onReinstate,
  onHistory,
}: {
  med: Medication
  onEdit: () => void
  onDiscontinue?: () => void
  onReinstate?: () => void
  onHistory: () => void
}) {
  const duration = (() => {
    if (!med.start_date || med.status !== 'active') return null
    try {
      const start = parseISO(med.start_date)
      const now = new Date()
      const years = differenceInYears(now, start)
      if (years >= 1) return `${years}y`
      const months = differenceInMonths(now, start)
      if (months >= 1) return `${months}mo`
      const days = differenceInDays(now, start)
      if (days > 0) return `${days}d`
    } catch { /* ignore */ }
    return null
  })()

  const startLabel = med.start_date
    ? formatDateWithPrecision(med.start_date, med.start_date_precision)
    : null

  return (
    <div className="group flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/50 transition-colors">
      <Pill className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${med.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-tight ${med.status === 'discontinued' ? 'text-muted-foreground line-through' : ''}`}>
          {med.medication_name} {med.dosage && <span className="font-normal">· {med.dosage}</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {med.frequency && <span className="text-xs text-muted-foreground">{med.frequency}</span>}
          {med.route && <span className="text-xs text-muted-foreground">· {med.route}</span>}
          {duration && (
            <span className="text-[10px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0 rounded-full">
              Since {startLabel ?? duration}
            </span>
          )}
          {med.status === 'discontinued' && (
            <Badge variant="muted" className="text-xs py-0 px-1">D/C</Badge>
          )}
        </div>
        {med.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{med.notes}</p>}
        {(med.updated_profile?.full_name || med.created_profile?.full_name) && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {med.updated_profile?.full_name
              ? `Updated by ${med.updated_profile.full_name}`
              : `Added by ${med.created_profile!.full_name}`}
          </p>
        )}
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onHistory}>
          <History className="h-3 w-3" />
        </Button>
        {onDiscontinue && med.status === 'active' && (
          <Button variant="ghost" size="icon-sm" onClick={onDiscontinue} title="Discontinue">
            <XCircle className="h-3 w-3 text-destructive" />
          </Button>
        )}
        {onReinstate && med.status === 'discontinued' && (
          <Button variant="ghost" size="icon-sm" onClick={onReinstate} title="Reinstate">
            <RotateCcw className="h-3 w-3 text-sky-600" />
          </Button>
        )}
      </div>
    </div>
  )
}
