/**
 * ConsultAnswerBanner — shown on the encounter when a specialist arrives via
 * a consult row (?consult=<block_action id>). The answer is a normal
 * Consultation block written in this encounter; "Mark answered" links the
 * latest one as the order's result (result_block_id), which completes the
 * order and fires the requester's toast. Self-contained: renders nothing
 * without the param.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Stethoscope, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Button } from './ui'

type ConsultCtx = {
  actionId: string
  deptName: string
  requesterName: string | null
}

export function ConsultAnswerBanner({ encounterId }: { encounterId: string }) {
  const { user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const actionId = params.get('consult')

  const [ctx, setCtx] = useState<ConsultCtx | null>(null)
  const [answered, setAnswered] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!actionId) return
    let cancelled = false
    ;(async () => {
      const { data: action } = await supabase
        .from('block_actions')
        .select('id, encounter_id, action_type, status, triggered_by')
        .eq('id', actionId)
        .maybeSingle()
      // Wrong encounter, finished, or gone → drop the param quietly
      if (!action || action.encounter_id !== encounterId || ['completed', 'cancelled'].includes(action.status)) {
        if (!cancelled) {
          setParams(p => { const n = new URLSearchParams(p); n.delete('consult'); return n }, { replace: true })
        }
        return
      }
      const [{ data: dept }, { data: requester }] = await Promise.all([
        supabase.from('departments').select('name').eq('slug', action.action_type).maybeSingle(),
        action.triggered_by
          ? supabase.from('profiles').select('full_name').eq('id', action.triggered_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!cancelled) {
        setCtx({
          actionId: action.id,
          deptName: dept?.name ?? action.action_type,
          requesterName: (requester as { full_name?: string } | null)?.full_name ?? null,
        })
      }
    })()
    return () => { cancelled = true }
  }, [actionId, encounterId, setParams])

  const markAnswered = async () => {
    if (!ctx || !user) return
    setSaving(true)
    setError(null)
    const { data: answer } = await supabase
      .from('blocks')
      .select('id')
      .eq('encounter_id', encounterId)
      .eq('type', 'consultation')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!answer) {
      setSaving(false)
      setError('Add a Consultation block first — it becomes the answer.')
      return
    }
    const { error: updateError } = await supabase
      .from('block_actions')
      .update({
        status: 'completed',
        result_block_id: answer.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', ctx.actionId)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAnswered(true)
    setParams(p => { const n = new URLSearchParams(p); n.delete('consult'); return n }, { replace: true })
  }

  if (!ctx || (!actionId && !answered)) return null

  if (answered) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Consult answered{ctx.requesterName ? ` — ${ctx.requesterName} will be notified` : ''}.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b bg-indigo-50 dark:bg-indigo-950/20 text-xs">
      <Stethoscope className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
      <span className="text-indigo-900 dark:text-indigo-200 flex-1 min-w-[200px]">
        <span className="font-medium">{ctx.deptName} consult</span>
        {ctx.requesterName && <> · asked by {ctx.requesterName}</>}
        {' — '}add a Consultation block, then mark it answered.
      </span>
      {error && (
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </span>
      )}
      <Button size="sm" variant="outline" className="h-6 text-xs shrink-0" disabled={saving} onClick={markAnswered}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark answered'}
      </Button>
    </div>
  )
}
