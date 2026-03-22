import { useState } from 'react'
import type { Block, PlanContent, PlanProblem } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

// ============================================================
// Helpers
// ============================================================

function newProblem(): PlanProblem {
  return { id: crypto.randomUUID(), problem: '', plan: '' }
}

export function emptyPlan(): PlanContent {
  return { assessment: '', problems: [], followup: '' }
}

// ============================================================
// View
// ============================================================

export function PlanView({ block }: { block: Block }) {
  const c = block.content as Partial<PlanContent>
  const assessment = (c.assessment ?? '').trim()
  const problems = c.problems ?? []
  const followup = (c.followup ?? '').trim()
  const [showAll, setShowAll] = useState(false)

  const hasContent = assessment || problems.length > 0 || followup

  if (!hasContent) {
    return <p className="text-sm text-muted-foreground italic">No plan documented.</p>
  }

  const visible = showAll ? problems : problems.slice(0, 4)
  const hidden = problems.length - 4

  return (
    <div className="space-y-4 text-sm">
      {assessment && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assessment</p>
          <p className="whitespace-pre-wrap leading-relaxed">{assessment}</p>
        </div>
      )}

      {problems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plan</p>
          <ol className="space-y-3">
            {visible.map((p, idx) => (
              <li key={p.id} className="flex gap-3">
                <span className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{p.problem || '—'}</p>
                  {p.plan && (
                    <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{p.plan}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {hidden > 0 && !showAll && (
            <button
              type="button"
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => setShowAll(true)}
            >
              +{hidden} more problem{hidden > 1 ? 's' : ''}…
            </button>
          )}
        </div>
      )}

      {followup && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Follow-up</p>
            <p className="whitespace-pre-wrap leading-relaxed">{followup}</p>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

interface EditProps {
  block: Block
  onSave: (c: PlanContent) => Promise<void>
  onCancel: () => void
}

export function PlanEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<PlanContent>
  const [assessment, setAssessment] = useState(existing.assessment ?? '')
  const [problems, setProblems] = useState<PlanProblem[]>(
    existing.problems?.length ? existing.problems : []
  )
  const [followup, setFollowup] = useState(existing.followup ?? '')
  const [saving, setSaving] = useState(false)
  const [planOpen, setPlanOpen] = useState(true)

  const addProblem = () => setProblems(prev => [...prev, newProblem()])

  const removeProblem = (id: string) =>
    setProblems(prev => prev.filter(p => p.id !== id))

  const patchProblem = (id: string, patch: Partial<PlanProblem>) =>
    setProblems(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))

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
          className="resize-none text-sm"
          placeholder="Overall clinical impression, differential diagnoses…"
          value={assessment}
          onChange={e => setAssessment(e.target.value)}
        />
      </div>

      <Separator />

      {/* Problem-based plan */}
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
          <div className="space-y-3 pl-1">
            {problems.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-2 border border-dashed rounded-md">
                No problems added yet.
              </p>
            )}
            {problems.map((p, idx) => (
              <ProblemRow
                key={p.id}
                problem={p}
                index={idx}
                onChange={patch => patchProblem(p.id, patch)}
                onRemove={() => removeProblem(p.id)}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={addProblem}
            >
              <Plus className="h-3.5 w-3.5" />
              Add problem
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
          className="resize-none text-sm"
          placeholder="Discharge instructions, return precautions, follow-up appointments…"
          value={followup}
          onChange={e => setFollowup(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save plan
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// ProblemRow — module-level to preserve focus
// ============================================================

function ProblemRow({
  problem,
  index,
  onChange,
  onRemove,
}: {
  problem: PlanProblem
  index: number
  onChange: (patch: Partial<PlanProblem>) => void
  onRemove: () => void
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Problem #{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
          aria-label="Remove problem"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Problem / Diagnosis</Label>
        <Input
          value={problem.problem}
          placeholder="e.g. Community-acquired pneumonia"
          className="h-8 text-sm"
          onChange={e => onChange({ problem: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Plan</Label>
        <Textarea
          rows={2}
          className="resize-none text-sm"
          placeholder="Investigations, treatments, monitoring, patient education…"
          value={problem.plan}
          onChange={e => onChange({ plan: e.target.value })}
        />
      </div>
    </div>
  )
}
