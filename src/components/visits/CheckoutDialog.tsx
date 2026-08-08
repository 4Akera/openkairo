/**
 * CheckoutDialog — end a visit, with a heads-up (never a block) on
 * unsettled charges and in-flight department orders. Shared by the queue
 * rows and the encounter page's journey strip.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSettingsStore } from '../../stores/settingsStore'
import { visitPatient, finishVisit } from '../../lib/visits'
import type { Visit } from '../../types'
import { fullName } from '../../lib/utils'
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui'
import { Loader2, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react'

type ChargeRow = { id: string; description: string; status: string }
type OrderRow = { id: string; action_type: string; status: string }

export function CheckoutDialog({
  visit,
  onClose,
  onCheckedOut,
}: {
  /** The visit being checked out; null = dialog closed */
  visit: Visit | null
  onClose: () => void
  onCheckedOut?: () => void
}) {
  const { nameFormat } = useSettingsStore()
  const [loading, setLoading] = useState(false)
  const [pendingCharges, setPendingCharges] = useState<ChargeRow[]>([])
  const [openOrders, setOpenOrders] = useState<OrderRow[]>([])

  useEffect(() => {
    if (!visit) return
    let cancelled = false
    setLoading(true)
    const patient = visitPatient(visit)
    Promise.all([
      patient
        ? supabase
            .from('charges')
            .select('id, description, status')
            .eq('patient_id', patient.id)
            .in('status', ['pending', 'pending_approval', 'invoiced'])
        : Promise.resolve({ data: [] }),
      supabase
        .from('block_actions')
        .select('id, action_type, status')
        .eq('encounter_id', visit.id)
        .not('status', 'in', '("completed","cancelled")'),
    ]).then(([chargesRes, ordersRes]) => {
      if (cancelled) return
      setPendingCharges((chargesRes.data ?? []) as ChargeRow[])
      setOpenOrders((ordersRes.data ?? []) as OrderRow[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [visit])

  const confirm = async () => {
    if (!visit) return
    await finishVisit(visit.id)
    onClose()
    onCheckedOut?.()
  }

  const pt = visit ? visitPatient(visit) : null

  return (
    <Dialog open={!!visit} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish visit</DialogTitle>
          <DialogDescription>{pt ? fullName(pt, nameFormat) : ''}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking charges and orders…
          </div>
        ) : (
          <div className="space-y-3">
            {pendingCharges.length === 0 && openOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                No pending charges or open orders.
              </p>
            ) : (
              <div className="space-y-2">
                {pendingCharges.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {pendingCharges.length} unsettled charge{pendingCharges.length > 1 ? 's' : ''}
                    </p>
                    <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                      {pendingCharges.slice(0, 5).map(c => (
                        <li key={c.id} className="truncate">{c.description} · {c.status}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {openOrders.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {openOrders.length} order{openOrders.length > 1 ? 's' : ''} still in progress
                    </p>
                    <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                      {openOrders.slice(0, 5).map(o => (
                        <li key={o.id} className="capitalize truncate">{o.action_type} · {o.status.replace('_', ' ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  You can still finish the visit — this is only a heads-up.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void confirm()}>
                <LogOut className="h-3.5 w-3.5" /> Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
