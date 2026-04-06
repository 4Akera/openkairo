import { useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Block, PlanContent, PlanProblem, Problem } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  Download, AlertCircle, CheckCircle2, Link2,
} from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newProblem(override?: Partial<PlanProblem>): PlanProblem {
  return { id: crypto.randomUUID(), problem: '', plan: '', importance: null, chart_problem_id: null, ...override }
}

export function emptyPlan(): PlanContent {
  return { assessment: '', problems: [], followup: '' }
}

const IMPORTANCE_STYLES: Record<string, string> = {
  high:   'bg-rose-50  text-rose-700  border-rose-200  dark:bg-rose-950/40  dark:text-rose-400  dark:border-rose-800',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
  low:    'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700',
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function PlanView({ block }: { block: Block }) {
  const c = block.content as Partial<PlanContent>
  const assessment = (c.assessment ?? '').trim()
  const problems   = c.problems ?? []
  const followup   = (c.followup ?? '').trim()
  const [showAll, setShowAll] = useState(false)

  if (!assessment && problems.length === 0 && !followup) {
    return <p className="text-sm text-muted-foreground italic">No assessment and plan documented.</p>
  }

  const visible = showAll ? problems : problems.slice(0, 5)
  const hidden  = problems.length - 5

  return (
    <div className="space-y-4 text-sm">
      {assessment && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assessment / Impression</p>
          <p className="whitespace-pre-wrap leading-relaxed">{assessment}</p>
        </div>
      )}

      {problems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Problem-based Plan <span className="font-normal">({problems.length})</span>
          </p>
          <ol className="space-y-3">
            {visible.map((p, idx) => (
              <li key={p.id} className="flex gap-3">
                <span className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium">{p.problem || '—'}</p>
                    {p.importance && (
                      <span className={cn('text-[10px] px-1.5 py-0 rounded-full border capitalize', IMPORTANCE_STYLES[p.importance])}>
                        {p.importance}
                      </span>
                    )}
                    {p.chart_problem_id && (
                      <span title="Linked to patient chart" className="inline-flex items-center gap-0.5 text-[10px] text-primary/60">
                        <Link2 className="h-2.5 w-2.5" /> chart
                      </span>
                    )}
                  </div>
                  {p.plan && (
                    <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap text-xs leading-relaxed">{p.plan}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {hidden > 0 && !showAll && (
            <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => setShowAll(true)}>
              +{hidden} more problem{hidden > 1 ? 's' : ''}…
            </button>
          )}
        </div>
      )}

      {followup && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Disposition / Follow-up</p>
            <p className="whitespace-pre-wrap leading-relaxed">{followup}</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Chart import panel ────────────────────────────────────────────────────────

function ChartProblemImporter({
  patientId,
  existingChartIds,
  onImport,
}: {
  patientId: string
  existingChartIds: Set<string>
  onImport: (problems: PlanProblem[]) => void
}) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [chartProblems, setChartProblems] = useState<Problem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (chartProblems.length > 0) return
    setLoading(true)
    const { data } = await supabase
      .from('patient_problems')
      .select('*')
      .eq('patient_id', patientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setChartProblems((data ?? []) as Problem[])
    setLoading(false)
  }, [patientId, chartProblems.length])

  const toggle = (open: boolean) => {
    setOpen(open)
    if (open) load()
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const importable = chartProblems.filter(p => !existingChartIds.has(p.id))
    setSelected(new Set(importable.map(p => p.id)))
  }

  const handleImport = () => {
    const toImport = chartProblems
      .filter(p => selected.has(p.id))
      .map(p => newProblem({
        problem:          p.problem,
        importance:       p.importance ?? null,
        chart_problem_id: p.id,
      }))
    onImport(toImport)
    setSelected(new Set())
    setOpen(false)
  }

  const importable = chartProblems.filter(p => !existingChartIds.has(p.id))
  const alreadyIn  = chartProblems.filter(p =>  existingChartIds.has(p.id))

  return (
    <div className="rounded-md border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => toggle(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <Download className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        Import from patient chart
        {alreadyIn.length > 0 && (
          <span className="ml-1 text-[10px] text-muted-foreground">({alreadyIn.length} already added)</span>
        )}
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : chartProblems.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-2">No active problems in chart</p>
          ) : (
            <>
              {importable.length > 1 && selected.size === 0 && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select all ({importable.length})
                </button>
              )}
              <ul className="space-y-1">
                {chartProblems.map(p => {
                  const alreadyAdded = existingChartIds.has(p.id)
                  const isSelected   = selected.has(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => !alreadyAdded && toggleSelect(p.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                          alreadyAdded
                            ? 'opacity-50 cursor-default'
                            : isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-accent',
                        )}
                      >
                        {alreadyAdded ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <div className={cn(
                            'h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center',
                            isSelected ? 'bg-primary border-primary' : 'border-border',
                          )}>
                            {isSelected && <div className="h-2 w-2 rounded-sm bg-white" />}
                          </div>
                        )}
                        <AlertCircle className={cn(
                          'h-3 w-3 shrink-0',
                          p.importance === 'high' ? 'text-rose-500' : p.importance === 'medium' ? 'text-amber-500' : 'text-slate-400',
                        )} />
                        <span className="flex-1 truncate font-medium">{p.problem}</span>
                        {p.importance && (
                          <span className={cn('text-[10px] px-1.5 py-0 rounded-full border capitalize shrink-0', IMPORTANCE_STYLES[p.importance])}>
                            {p.importance}
                          </span>
                        )}
                        {alreadyAdded && <span className="text-[10px] text-muted-foreground shrink-0">added</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {selected.size > 0 && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={() => setSelected(new Set())}
                    className="text-xs h-7"
                  >
                    Clear
                  </Button>
                  <Button
                    type="button" size="sm"
                    onClick={handleImport}
                    className="text-xs h-7 gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Add {selected.size} problem{selected.size > 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ProblemRow — module-level to preserve input focus ───────────────────────

function ProblemRow({
  problem,
  index,
  onChange,
  onRemove,
}: {
  problem:  PlanProblem
  index:    number
  onChange: (patch: Partial<PlanProblem>) => void
  onRemove: () => void
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2.5 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
            {index + 1}
          </span>
          {/* Importance selector */}
          <div className="flex gap-1">
            {(['high', 'medium', 'low'] as const).map(imp => (
              <button
                key={imp}
                type="button"
                onClick={() => onChange({ importance: problem.importance === imp ? null : imp })}
                className={cn(
                  'text-[10px] px-1.5 py-0 rounded-full border capitalize transition-colors',
                  problem.importance === imp
                    ? IMPORTANCE_STYLES[imp]
                    : 'border-border/50 text-muted-foreground hover:border-border',
                )}
              >
                {imp}
              </button>
            ))}
          </div>
          {problem.chart_problem_id && (
            <span title="Linked to patient chart" className="inline-flex items-center gap-0.5 text-[10px] text-primary/60 shrink-0">
              <Link2 className="h-2.5 w-2.5" /> chart
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Problem name */}
      <div className="space-y-1">
        <Label className="text-xs">Problem / Diagnosis</Label>
        <Input
          value={problem.problem}
          placeholder="e.g. Community-acquired pneumonia"
          className="h-8 text-sm"
          onChange={e => onChange({ problem: e.target.value })}
        />
      </div>

      {/* Plan */}
      <div className="space-y-1">
        <Label className="text-xs">Management Plan</Label>
        <Textarea
          rows={2}
          className="text-sm"
          placeholder="Investigations, treatments, monitoring, patient education…"
          value={problem.plan}
          onChange={e => onChange({ plan: e.target.value })}
        />
      </div>
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: PlanContent) => Promise<void>
  onCancel: () => void
}

export function PlanEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<PlanContent>
  const [assessment, setAssessment] = useState(existing.assessment ?? '')
  const [problems, setProblems]     = useState<PlanProblem[]>(
    (existing.problems ?? []).map(p => ({
      ...p,
      importance: p.importance ?? null,
      chart_problem_id: p.chart_problem_id ?? null,
    }))
  )
  const [followup, setFollowup] = useState(existing.followup ?? '')
  const [saving, setSaving]     = useState(false)
  const [planOpen, setPlanOpen] = useState(true)

  const patientId = block.patient_id

  const existingChartIds = new Set(
    problems.map(p => p.chart_problem_id).filter(Boolean) as string[]
  )

  const addProblem   = () => setProblems(prev => [...prev, newProblem()])
  const removeProblem = (id: string) => setProblems(prev => prev.filter(p => p.id !== id))
  const patchProblem  = (id: string, patch: Partial<PlanProblem>) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  const importProblems = (toAdd: PlanProblem[]) =>
    setProblems(prev => [...prev, ...toAdd])

  const handleSave = async () => {
    setSaving(true)
    await onSave({ assessment, problems, followup })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Assessment */}
      <div className="space-y-1.5">
        <Label>Assessment / Impression</Label>
        <Textarea
          rows={3}
          placeholder="Overall clinical impression, working diagnosis, differential diagnoses…"
          value={assessment}
          onChange={e => setAssessment(e.target.value)}
        />
      </div>

      <Separator />

      {/* Problem-based Plan */}
      <div>
        <button
          type="button"
          onClick={() => setPlanOpen(o => !o)}
          className="flex items-center gap-1.5 w-full text-left text-sm font-semibold mb-2 hover:text-primary transition-colors"
        >
          {planOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Problem-based Plan
          {problems.length > 0 && (
            <span className="ml-1 text-xs text-muted-foreground font-normal">({problems.length})</span>
          )}
        </button>

        {planOpen && (
          <div className="space-y-2.5 pl-1">
            {/* Chart importer — only when patient context is available */}
            {patientId && (
              <ChartProblemImporter
                patientId={patientId}
                existingChartIds={existingChartIds}
                onImport={importProblems}
              />
            )}

            {problems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
                No problems added yet.
              </p>
            ) : (
              <div className="space-y-2">
                {problems.map((p, idx) => (
                  <ProblemRow
                    key={p.id}
                    problem={p}
                    index={idx}
                    onChange={patch => patchProblem(p.id, patch)}
                    onRemove={() => removeProblem(p.id)}
                  />
                ))}
              </div>
            )}

            <Button
              type="button" variant="outline" size="sm"
              className="w-full gap-1.5"
              onClick={addProblem}
            >
              <Plus className="h-3.5 w-3.5" />
              Add problem manually
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Follow-up */}
      <div className="space-y-1.5">
        <Label>Disposition / Follow-up</Label>
        <Textarea
          rows={2}
          placeholder="Discharge instructions, return precautions, follow-up appointments…"
          value={followup}
          onChange={e => setFollowup(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save A&P
        </Button>
      </div>
    </div>
  )
}
