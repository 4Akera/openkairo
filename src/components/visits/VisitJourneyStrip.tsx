/**
 * VisitJourneyStrip — the visit's logistics, inside the encounter.
 *
 * A slim bar under the encounter header showing arrived → stage → checkout
 * for the linked visit, with the stage advanceable and checkout available
 * right there — clinicians never need the Front Desk to move a patient
 * along. Renders nothing when the encounter has no linked visit.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNow } from '../../hooks/useNow'
import { updateVisit } from '../../lib/visits'
import { CheckoutDialog } from './CheckoutDialog'
import type { Visit } from '../../types'
import { formatDateTime } from '../../lib/utils'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui'
import { Footprints, LogOut, CheckCircle2 } from 'lucide-react'

export function VisitJourneyStrip({
  encounterId,
  onVisitChange,
}: {
  encounterId: string
  /** Reports the linked visit upward (e.g. so Finish can chain checkout) */
  onVisitChange?: (visit: Visit | null) => void
}) {
  const { flowStages } = useSettingsStore()
  const now = useNow()
  const [visit, setVisit] = useState<Visit | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const load = useCallback(async () => {
    // The encounter IS the journey — read the row itself
    const { data } = await supabase
      .from('encounters')
      .select('*, patients(*)')
      .eq('id', encounterId)
      .maybeSingle()
    const v = (data as Visit | null) ?? null
    setVisit(v)
    onVisitChange?.(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`visit-journey:${encounterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encounters', filter: `id=eq.${encounterId}` },
        () => { void load() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [encounterId, load])

  if (!visit || !visit.arrived_at) return null

  const waitMin = Math.floor((now - new Date(visit.arrived_at).getTime()) / 60000)
  const waitLabel = waitMin < 60 ? `${waitMin}m` : `${Math.floor(waitMin / 60)}h ${waitMin % 60}m`

  return (
    <>
      <div className="border-b bg-primary/[0.03] px-3 sm:px-4 py-1.5 flex items-center gap-2.5 text-xs shrink-0 overflow-x-auto no-scrollbar">
        <Footprints className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span className="text-muted-foreground whitespace-nowrap">
          Arrived {formatDateTime(visit.arrived_at)}
          {!visit.finished_at && <> · in clinic <span className="font-medium text-foreground/80">{waitLabel}</span></>}
        </span>

        {visit.finished_at ? (
          <span className="flex items-center gap-1 text-emerald-600 whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Checked out {formatDateTime(visit.finished_at)}
          </span>
        ) : (
          <>
            {flowStages.length > 0 && (
              <Select
                value={visit.stage && flowStages.includes(visit.stage) ? visit.stage : flowStages[0]}
                onValueChange={(s) => {
                  setVisit(v => (v ? { ...v, stage: s } : v))
                  void updateVisit(visit.id, { stage: s })
                }}
              >
                <SelectTrigger className="h-6 w-[120px] text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {flowStages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="ml-auto flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors whitespace-nowrap"
            >
              <LogOut className="h-3 w-3" /> Check out
            </button>
          </>
        )}
      </div>

      <CheckoutDialog
        visit={checkoutOpen ? visit : null}
        onClose={() => setCheckoutOpen(false)}
        onCheckedOut={() => void load()}
      />
    </>
  )
}
