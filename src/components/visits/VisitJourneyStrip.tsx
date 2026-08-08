/**
 * VisitJourneyStrip — the encounter's own journey, under its header.
 *
 * Pure presentation: the page passes the encounter row (which carries
 * arrived/stage/finished since the restructure) and a patient for the
 * checkout dialog. Renders nothing when the patient never arrived.
 */
import { useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNow } from '../../hooks/useNow'
import { updateVisit } from '../../lib/visits'
import { CheckoutDialog } from './CheckoutDialog'
import type { Encounter, Patient, Visit } from '../../types'
import { formatDateTime } from '../../lib/utils'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui'
import { Footprints, LogOut, CheckCircle2 } from 'lucide-react'

export function VisitJourneyStrip({
  encounter,
  patient,
  onChanged,
}: {
  encounter: Encounter
  patient: Patient | null
  /** Called after the strip mutates the journey (stage / checkout) */
  onChanged: () => void
}) {
  const { flowStages } = useSettingsStore()
  const now = useNow()
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  if (!encounter.arrived_at) return null

  const waitMin = Math.floor((now - new Date(encounter.arrived_at).getTime()) / 60000)
  const waitLabel = waitMin < 60 ? `${waitMin}m` : `${Math.floor(waitMin / 60)}h ${waitMin % 60}m`
  const asVisit: Visit = { ...encounter, patients: patient }

  return (
    <>
      <div className="border-b bg-primary/[0.03] px-3 sm:px-4 py-1.5 flex items-center gap-2.5 text-xs shrink-0 overflow-x-auto no-scrollbar">
        <Footprints className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span className="text-muted-foreground whitespace-nowrap">
          Arrived {formatDateTime(encounter.arrived_at)}
          {!encounter.finished_at && <> · in clinic <span className="font-medium text-foreground/80">{waitLabel}</span></>}
        </span>

        {encounter.finished_at ? (
          <span className="flex items-center gap-1 text-emerald-600 whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Done {formatDateTime(encounter.finished_at)}
          </span>
        ) : (
          <>
            {flowStages.length > 0 && (
              <Select
                value={encounter.stage && flowStages.includes(encounter.stage) ? encounter.stage : flowStages[0]}
                onValueChange={(s) => {
                  void updateVisit(encounter.id, { stage: s }).then(onChanged)
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
              <LogOut className="h-3 w-3" /> Done
            </button>
          </>
        )}
      </div>

      <CheckoutDialog
        visit={checkoutOpen ? asVisit : null}
        onClose={() => setCheckoutOpen(false)}
        onCheckedOut={onChanged}
      />
    </>
  )
}
