import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { Problem, ProblemHistory, DatePrecision } from '../../types'
import { formatDateWithPrecision, formatDateTime, cn } from '../../lib/utils'
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
import {
  Plus, Edit2, CheckCircle2, History, Loader2, AlertCircle, RotateCcw,
} from 'lucide-react'

interface Props {
  patientId: string
  /** Called after problems are mutated so parent (e.g. clinical summary) can stay in sync */
  onProblemsChanged?: () => void
}

type FormMode = 'add' | 'edit'

const emptyForm = {
  problem: '',
  onset_date: '' as string | null,
  onset_date_precision: 'full' as DatePrecision,
  notes: '',
  importance: 'medium' as 'high' | 'medium' | 'low',
}

const IMPORTANCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const IMPORTANCE_STYLES: Record<string, string> = {
  high:   'bg-rose-50   text-rose-700   border-rose-200',
  medium: 'bg-amber-50  text-amber-700  border-amber-200',
  low:    'bg-slate-50  text-slate-600  border-slate-200',
}

export default function ProblemList({ patientId, onProblemsChanged }: Props) {
  const { user } = useAuthStore()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('add')
  const [selected, setSelected] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ProblemHistory[]>([])
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadProblems = useCallback(async () => {
    const { data, error } = await supabase
      .from('patient_problems')
      .select('*, created_profile:profiles!created_by(full_name), updated_profile:profiles!updated_by(full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
    if (error) {
      const { data: basic } = await supabase
        .from('patient_problems')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      setProblems((basic ?? []) as Problem[])
    } else {
      setProblems((data ?? []) as Problem[])
    }
    setLoading(false)
  }, [patientId])

  useEffect(() => { loadProblems() }, [loadProblems])

  const openAdd = () => {
    setMode('add')
    setForm(emptyForm)
    setSelected(null)
    setFormOpen(true)
  }

  const openEdit = (p: Problem) => {
    setMode('edit')
    setSelected(p)
    setForm({
      problem: p.problem,
      onset_date: p.onset_date ?? null,
      onset_date_precision: p.onset_date_precision ?? 'full',
      notes: p.notes ?? '',
      importance: p.importance ?? 'medium',
    })
    setFormOpen(true)
  }

  const openHistory = async (p: Problem) => {
    setSelected(p)
    const { data } = await supabase
      .from('patient_problem_history')
      .select('*')
      .eq('problem_id', p.id)
      .order('changed_at', { ascending: false })
    setHistory(data ?? [])
    setHistoryOpen(true)
  }

  const handleSave = async () => {
    if (!user || !form.problem.trim()) return
    setSaving(true)

    if (mode === 'add') {
      const { error } = await supabase.from('patient_problems').insert({
        patient_id: patientId,
        problem: form.problem,
        onset_date: form.onset_date || null,
        onset_date_precision: form.onset_date_precision,
        notes: form.notes || null,
        importance: form.importance,
        created_by: user.id,
      })
      if (!error) {
        setFormOpen(false)
        await loadProblems()
        onProblemsChanged?.()
      }
    } else if (selected) {
      await supabase.from('patient_problem_history').insert({
        problem_id: selected.id,
        snapshot: selected,
        changed_by: user.id,
      })
      const { error } = await supabase
        .from('patient_problems')
        .update({
          problem: form.problem,
          onset_date: form.onset_date || null,
          onset_date_precision: form.onset_date_precision,
          notes: form.notes || null,
          importance: form.importance,
          updated_by: user.id,
        })
        .eq('id', selected.id)
      if (!error) {
        setFormOpen(false)
        await loadProblems()
        onProblemsChanged?.()
      }
    }
    setSaving(false)
  }

  const handleResolve = async (p: Problem) => {
    if (!user) return
    await supabase.from('patient_problem_history').insert({
      problem_id: p.id,
      snapshot: p,
      changed_by: user.id,
    })
    await supabase
      .from('patient_problems')
      .update({ status: 'resolved', ended_date: new Date().toISOString().split('T')[0], updated_by: user.id })
      .eq('id', p.id)
    await loadProblems()
    onProblemsChanged?.()
  }

  const handleReactivate = async (p: Problem) => {
    if (!user) return
    await supabase.from('patient_problem_history').insert({
      problem_id: p.id,
      snapshot: p,
      changed_by: user.id,
    })
    await supabase
      .from('patient_problems')
      .update({ status: 'active', ended_date: null, updated_by: user.id })
      .eq('id', p.id)
    await loadProblems()
    onProblemsChanged?.()
  }

  const active = problems
    .filter(p => p.status === 'active')
    .sort((a, b) =>
      (IMPORTANCE_ORDER[a.importance ?? 'medium'] ?? 1) -
      (IMPORTANCE_ORDER[b.importance ?? 'medium'] ?? 1)
    )
  const resolved = problems.filter(p => p.status === 'resolved')

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Problems ({active.length} active)
          </span>
          <Button variant="ghost" size="icon-sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : problems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-1">No problems recorded</p>
        ) : (
          <div className="space-y-1">
            {active.map(p => (
              <ProblemRow
                key={p.id}
                problem={p}
                onEdit={() => openEdit(p)}
                onResolve={() => handleResolve(p)}
                onHistory={() => openHistory(p)}
              />
            ))}
            {resolved.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-1.5 pb-0.5 uppercase tracking-wide font-medium">Resolved</p>
                {resolved.map(p => (
                  <ProblemRow
                    key={p.id}
                    problem={p}
                    onEdit={() => openEdit(p)}
                    onReactivate={() => handleReactivate(p)}
                    onHistory={() => openHistory(p)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'add' ? 'Add Problem' : 'Edit Problem'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Problem / Diagnosis *</Label>
              <Input
                placeholder="e.g. Hypertension, Type 2 Diabetes"
                value={form.problem}
                onChange={e => setForm(f => ({ ...f, problem: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Onset date</Label>
                <ClinicalDatePicker
                  value={form.onset_date}
                  precision={form.onset_date_precision}
                  onChange={(iso, prec) =>
                    setForm(f => ({
                      ...f,
                      onset_date: iso,
                      onset_date_precision: prec ?? 'full',
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Importance</Label>
                <Select
                  value={form.importance}
                  onValueChange={v => setForm(f => ({ ...f, importance: v as typeof form.importance }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Clinical notes, context…"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.problem.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === 'add' ? 'Add Problem' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Trail · {selected?.problem}</DialogTitle>
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
                      <p><span className="text-muted-foreground">Problem:</span> {h.snapshot.problem}</p>
                      <p><span className="text-muted-foreground">Onset:</span> {formatDateWithPrecision(h.snapshot.onset_date, h.snapshot.onset_date_precision)}</p>
                      <p><span className="text-muted-foreground">Status:</span> {h.snapshot.status}</p>
                      {h.snapshot.importance && <p><span className="text-muted-foreground">Importance:</span> {h.snapshot.importance}</p>}
                      {h.snapshot.notes && <p><span className="text-muted-foreground">Notes:</span> {h.snapshot.notes}</p>}
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

function ProblemRow({
  problem,
  onEdit,
  onResolve,
  onReactivate,
  onHistory,
}: {
  problem: Problem
  onEdit: () => void
  onResolve?: () => void
  onReactivate?: () => void
  onHistory: () => void
}) {
  const imp = problem.importance ?? 'medium'
  return (
    <div className="group flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/50 transition-colors">
      <AlertCircle
        className={cn(
          'h-3.5 w-3.5 mt-0.5 shrink-0',
          problem.status === 'active' ? 'text-amber-500' : 'text-muted-foreground',
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={cn(
            'text-xs font-medium leading-tight',
            problem.status === 'resolved' && 'text-muted-foreground line-through',
          )}>
            {problem.problem}
          </p>
          {problem.status === 'active' && (
            <span className={cn(
              'text-[10px] px-1.5 py-0 rounded-full border capitalize',
              IMPORTANCE_STYLES[imp],
            )}>
              {imp}
            </span>
          )}
          {problem.status === 'resolved' && (
            <Badge variant="muted" className="text-xs py-0 px-1">Resolved</Badge>
          )}
        </div>
        {problem.onset_date && (
          <span className="text-xs text-muted-foreground">
            Since {formatDateWithPrecision(problem.onset_date, problem.onset_date_precision)}
          </span>
        )}
        {problem.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{problem.notes}</p>
        )}
        {(problem.updated_profile?.full_name || problem.created_profile?.full_name) && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {problem.updated_profile?.full_name
              ? `Updated by ${problem.updated_profile.full_name}`
              : `Added by ${problem.created_profile!.full_name}`}
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
        {onResolve && problem.status === 'active' && (
          <Button variant="ghost" size="icon-sm" onClick={onResolve} title="Mark resolved">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          </Button>
        )}
        {onReactivate && problem.status === 'resolved' && (
          <Button variant="ghost" size="icon-sm" onClick={onReactivate} title="Reactivate">
            <RotateCcw className="h-3 w-3 text-sky-600" />
          </Button>
        )}
      </div>
    </div>
  )
}
