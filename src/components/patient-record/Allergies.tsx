import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { Allergy } from '../../types'
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui'
import { Plus, Edit2, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  patientId: string
}

type FormMode = 'add' | 'edit'

const emptyForm = {
  allergen: '',
  reaction: '',
  severity: '' as '' | 'mild' | 'moderate' | 'severe',
  notes: '',
}

const SEVERITY_COLORS: Record<string, string> = {
  mild:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  severe:   'bg-rose-50 text-rose-700 border-rose-200',
}

export default function Allergies({ patientId }: Props) {
  const { user } = useAuthStore()
  const [allergies, setAllergies] = useState<Allergy[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('add')
  const [selected, setSelected] = useState<Allergy | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadAllergies = useCallback(async () => {
    const { data, error } = await supabase
      .from('patient_allergies')
      .select('*, created_profile:profiles!created_by(full_name), updated_profile:profiles!updated_by(full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
    if (error) {
      const { data: basic } = await supabase
        .from('patient_allergies')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      setAllergies((basic ?? []) as Allergy[])
    } else {
      setAllergies((data ?? []) as Allergy[])
    }
    setLoading(false)
  }, [patientId])

  useEffect(() => { loadAllergies() }, [loadAllergies])

  const openAdd = () => {
    setMode('add')
    setForm(emptyForm)
    setSelected(null)
    setFormOpen(true)
  }

  const openEdit = (a: Allergy) => {
    setMode('edit')
    setSelected(a)
    setForm({
      allergen: a.allergen,
      reaction: a.reaction ?? '',
      severity: a.severity ?? '',
      notes: a.notes ?? '',
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!user || !form.allergen.trim()) return
    setSaving(true)

    const payload = {
      allergen: form.allergen.trim(),
      reaction: form.reaction.trim() || null,
      severity: form.severity || null,
      notes: form.notes.trim() || null,
    }

    if (mode === 'add') {
      const { error } = await supabase.from('patient_allergies').insert({
        ...payload,
        patient_id: patientId,
        created_by: user.id,
      })
      if (!error) { setFormOpen(false); loadAllergies() }
    } else if (selected) {
      const { error } = await supabase
        .from('patient_allergies')
        .update({ ...payload, updated_by: user.id })
        .eq('id', selected.id)
      if (!error) { setFormOpen(false); loadAllergies() }
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('patient_allergies').delete().eq('id', id)
    setConfirmDelete(null)
    loadAllergies()
  }

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Allergies ({allergies.length})
          </span>
          <Button variant="ghost" size="icon-sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : allergies.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-1">No known allergies recorded</p>
        ) : (
          <div className="space-y-1">
            {allergies.map(a => (
              <div
                key={a.id}
                className="group rounded-md border px-2.5 py-1.5 hover:bg-accent/30 transition-colors"
              >
                {confirmDelete === a.id ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-destructive">Delete this allergy?</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={() => handleDelete(a.id)}>
                        Yes, delete
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium">{a.allergen}</span>
                        {a.severity && (
                          <span className={cn(
                            'text-[10px] px-1.5 py-0 rounded-full border capitalize',
                            SEVERITY_COLORS[a.severity],
                          )}>
                            {a.severity}
                          </span>
                        )}
                        {a.reaction && (
                          <span className="text-[10px] text-muted-foreground">→ {a.reaction}</span>
                        )}
                      </div>
                      {a.notes && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{a.notes}</p>
                      )}
                      {(a.updated_profile?.full_name || a.created_profile?.full_name) && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {a.updated_profile?.full_name
                            ? `Updated by ${a.updated_profile.full_name}`
                            : `Added by ${a.created_profile!.full_name}`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:text-destructive"
                        onClick={() => setConfirmDelete(a.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === 'add' ? 'Add Allergy' : 'Edit Allergy'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Allergen *</Label>
              <Input
                placeholder="e.g. Penicillin, Peanuts, Latex"
                value={form.allergen}
                onChange={e => setForm(f => ({ ...f, allergen: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Reaction</Label>
              <Input
                placeholder="e.g. Rash, Anaphylaxis"
                value={form.reaction}
                onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={v => setForm(f => ({ ...f, severity: v as typeof form.severity }))}
              >
                <SelectTrigger><SelectValue placeholder="Select severity…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">Mild</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="severe">Severe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional details…"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.allergen.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === 'add' ? 'Add Allergy' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
