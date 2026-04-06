import { useState } from 'react'
import type { Block, ConsultationContent } from '../../../types'
import { Button, Input, Label, Separator, Textarea } from '../../ui'
import { Loader2, Stethoscope, MessageSquareReply, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Empty
// ============================================================

export function emptyConsultation(): ConsultationContent {
  return {
    service:           '',
    urgency:           '',
    reason:            '',
    clinical_summary:  '',
    question:          '',
    status:            'requested',
    answer:            '',
    answered_by:       '',
    answered_at:       null,
  }
}

// ============================================================
// Helpers
// ============================================================

const URGENCY_OPTS = [
  { v: 'routine', l: 'Routine' },
  { v: 'urgent',  l: 'Urgent'  },
  { v: 'stat',    l: 'STAT'    },
]

const STATUS_META: Record<ConsultationContent['status'], {
  label: string
  icon: React.ComponentType<{ className?: string }>
  cls: string
}> = {
  requested:    { label: 'Requested',    icon: Clock,          cls: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400' },
  acknowledged: { label: 'Acknowledged', icon: AlertCircle,    cls: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400' },
  answered:     { label: 'Answered',     icon: CheckCircle2,   cls: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400' },
}

const urgencyColor = (u: string) =>
  u === 'stat'   ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
  u === 'urgent' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
  u === 'routine'? 'bg-muted text-muted-foreground' : ''

// ============================================================
// View
// ============================================================

export function ConsultationView({ block }: { block: Block }) {
  const c = { ...emptyConsultation(), ...(block.content as Partial<ConsultationContent>) }
  const sm = STATUS_META[c.status] ?? STATUS_META.requested
  const StatusIcon = sm.icon

  const isEmpty = !c.service && !c.reason && !c.question
  if (isEmpty) {
    return <p className="text-sm text-muted-foreground italic">No consultation details.</p>
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Header: service + urgency + status */}
      <div className="flex flex-wrap items-center gap-2">
        {c.service && <span className="font-semibold">{c.service}</span>}
        {c.urgency && (
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', urgencyColor(c.urgency))}>
            {c.urgency.toUpperCase()}
          </span>
        )}
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border', sm.cls)}>
          <StatusIcon className="h-3 w-3" />
          {sm.label}
        </span>
      </div>

      {/* Request section */}
      <div className="space-y-2">
        {c.reason && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Reason</p>
            <p className="text-sm">{c.reason}</p>
          </div>
        )}
        {c.clinical_summary && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Clinical Summary</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{c.clinical_summary}</p>
          </div>
        )}
        {c.question && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Question</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{c.question}</p>
          </div>
        )}
      </div>

      {/* Answer section */}
      {c.answer && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <MessageSquareReply className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wide">Consultant's Response</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.answer}</p>
            {(c.answered_by || c.answered_at) && (
              <p className="text-[11px] text-muted-foreground">
                {c.answered_by && `— ${c.answered_by}`}
                {c.answered_at && ` · ${new Date(c.answered_at).toLocaleString()}`}
              </p>
            )}
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
  block:    Block
  onSave:   (c: ConsultationContent) => Promise<void>
  onCancel: () => void
}

export function ConsultationEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<ConsultationContent>
  const [form, setForm] = useState<ConsultationContent>({ ...emptyConsultation(), ...ex })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ConsultationContent>(k: K, v: ConsultationContent[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    const saved = {
      ...form,
      answered_at:
        form.status === 'answered' && !form.answered_at
          ? new Date().toISOString()
          : form.answered_at,
    }
    await onSave(saved)
    setSaving(false)
  }

  const canSave = form.service.trim() || form.reason.trim() || form.question.trim()

  return (
    <div className="space-y-4">

      {/* Request */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Service / Specialty</Label>
            <Input
              placeholder="e.g. Cardiology, Neurology…"
              value={form.service}
              onChange={e => set('service', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Urgency</Label>
            <div className="flex gap-1.5">
              {URGENCY_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set('urgency', form.urgency === o.v ? '' : o.v as ConsultationContent['urgency'])}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md border transition-colors',
                    form.urgency === o.v
                      ? o.v === 'stat'   ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 font-semibold'
                      : o.v === 'urgent' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 font-semibold'
                      : 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:bg-accent',
                  )}
                >{o.l}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Reason for consultation</Label>
          <Input
            placeholder="e.g. Chest pain evaluation, unexplained anaemia…"
            value={form.reason}
            onChange={e => set('reason', e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Clinical summary</Label>
          <Textarea
            rows={3}
            placeholder="Relevant history, examination findings, investigations…"
            value={form.clinical_summary}
            onChange={e => set('clinical_summary', e.target.value)}
            className="resize-none text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Specific question</Label>
          <Textarea
            rows={2}
            placeholder="What would you like the consultant to address?"
            value={form.question}
            onChange={e => set('question', e.target.value)}
            className="resize-none text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <div className="flex gap-1.5 flex-wrap">
          {(['requested', 'acknowledged', 'answered'] as const).map(s => {
            const sm = STATUS_META[s]
            const Icon = sm.icon
            return (
              <button
                key={s}
                type="button"
                onClick={() => set('status', s)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors',
                  form.status === s
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:bg-accent text-muted-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {sm.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Answer (visible when acknowledged or answered) */}
      {(form.status === 'acknowledged' || form.status === 'answered') && (
        <div className="space-y-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-800/40 dark:bg-emerald-950/10 p-3">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <MessageSquareReply className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Consultant's Response</span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Response</Label>
            <Textarea
              rows={4}
              placeholder="Consultant's findings, recommendations, and management plan…"
              value={form.answer}
              onChange={e => set('answer', e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Consultant name</Label>
            <Input
              placeholder="Dr. …"
              value={form.answered_by}
              onChange={e => set('answered_by', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving || !canSave} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <Stethoscope className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  )
}
