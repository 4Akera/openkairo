/**
 * ImportResultsDialog — the 100k-scale path for lab results: an analyzer/LIS
 * CSV comes in, staff verify the matches, and release. Each released row is
 * a normal lab_result block completing its pending order, so the timeline,
 * result toasts, and billing all behave exactly as if it were typed.
 *
 * Matching and parsing live in lib/resultImport (tested); this component is
 * fetch + review UI + the release loop.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  parseCsv, buildColumnMap, matchRows, buildResultContent,
  type ImportOrder, type MatchedRow, type UnmatchedRow,
} from '../../lib/resultImport'
import { usesCustomChargeRules, syncLabResultBlockCharges } from '../../lib/blockBilling'
import type { BlockDefinition, Department, LabResultContent } from '../../types'
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui'
import { cn } from '../../lib/utils'
import { FileUp, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

const ROW_CAP = 500

type PendingOrder = ImportOrder & {
  encounterId: string | null
  patientId: string
  patientLabel: string
}

export function ImportResultsDialog({
  dept,
  open,
  onOpenChange,
  onReleased,
}: {
  dept: Department
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once after a release pass so the queue can refresh. */
  onReleased: () => void
}) {
  const { user, profile, can } = useAuthStore()
  const { billingEnabled } = useSettingsStore()

  const [orders, setOrders] = useState<PendingOrder[] | null>(null)
  const [resultDef, setResultDef] = useState<BlockDefinition | null>(null)
  const [csvText, setCsvText] = useState('')
  const [releasing, setReleasing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<{ released: number; failed: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset per open; load pending lab orders + the lab_result definition
  useEffect(() => {
    if (!open) return
    setCsvText(''); setDone(null); setProgress(0)
    setOrders(null)
    supabase
      .from('block_actions')
      .select('id, encounter_id, action_payload, triggered_at, patients(id, first_name, last_name, mrn)')
      .eq('action_type', dept.slug)
      .not('status', 'in', '(completed,cancelled)')
      .order('triggered_at', { ascending: true })
      .limit(2000)
      .then(({ data }) => {
        type Row = {
          id: string
          encounter_id: string | null
          action_payload: { panels?: unknown } | null
          patients: { id: string; first_name: string; last_name: string; mrn: string } | null
        }
        const rows = ((data ?? []) as unknown as Row[])
          .filter(r => r.patients?.mrn && Array.isArray(r.action_payload?.panels))
          .map(r => ({
            actionId: r.id,
            mrn: r.patients!.mrn,
            panels: r.action_payload!.panels as string[],
            encounterId: r.encounter_id,
            patientId: r.patients!.id,
            patientLabel: `${r.patients!.first_name} ${r.patients!.last_name}`.trim(),
          }))
        setOrders(rows)
      })
    supabase
      .from('block_definitions')
      .select('*')
      .eq('slug', 'lab_result')
      .single()
      .then(({ data }) => setResultDef((data as BlockDefinition | null) ?? null))
  }, [open, dept.slug])

  const parsed = useMemo(() => {
    const text = csvText.trim()
    if (!text || orders === null) return null
    const rows = parseCsv(text)
    if (rows.length < 2) return null
    const map = buildColumnMap(rows[0])
    if (map.mrnCol === null) return { map, matched: [] as MatchedRow[], unmatched: [] as UnmatchedRow[], noMrnHeader: true, capped: false }
    const dataRows = rows.slice(1, 1 + ROW_CAP)
    const { matched, unmatched } = matchRows(dataRows, map, orders.map(o => ({ ...o })))
    return { map, matched, unmatched, noMrnHeader: false, capped: rows.length - 1 > ROW_CAP }
  }, [csvText, orders])

  const orderById = useMemo(
    () => new Map((orders ?? []).map(o => [o.actionId, o])),
    [orders],
  )

  const release = async () => {
    if (!parsed || !user || releasing) return
    setReleasing(true)
    let released = 0
    let failed = 0
    for (const row of parsed.matched) {
      setProgress(released + failed + 1)
      const order = orderById.get(row.order.actionId)
      if (!order) { failed++; continue }
      const content = buildResultContent(row.order, row) as LabResultContent
      const { data: newBlock, error } = await supabase
        .from('blocks')
        .insert({
          encounter_id: null,
          department_id: dept.id,
          department_block_type_id: null,
          patient_id: order.patientId,
          type: 'lab_result',
          definition_id: resultDef?.id ?? null,
          content,
          state: 'active',
          sequence_order: 0,
          share_to_record: true,
          visible_to_roles: [] as string[],
          is_template_seed: false,
          is_pinned: false,
          author_name: profile?.full_name ?? null,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (error || !newBlock) { failed++; continue }
      const { error: actErr } = await supabase
        .from('block_actions')
        .update({
          status: 'completed',
          result_block_id: (newBlock as { id: string }).id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', order.actionId)
      if (actErr) { failed++; continue }

      if (billingEnabled && can('billing.charge') && resultDef && usesCustomChargeRules(resultDef)) {
        await syncLabResultBlockCharges({
          blockId: (newBlock as { id: string }).id,
          patientId: order.patientId,
          encounterId: order.encounterId,
          userId: user.id,
          definition: resultDef,
          content,
        })
      }
      released++
    }
    setReleasing(false)
    setDone({ released, failed })
    onReleased()
  }

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!releasing) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import results</DialogTitle>
          <DialogDescription>
            One CSV row per sample: an <span className="font-mono">mrn</span> column plus test
            columns (e.g. <span className="font-mono">wbc, hb, na, k</span>). Rows are matched to
            this department&apos;s pending orders, oldest first — review, then release.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Released {done.released} result{done.released === 1 ? '' : 's'}.
              {done.failed > 0 && (
                <span className="text-amber-600">{done.failed} failed — those orders are still pending.</span>
              )}
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" /> Choose CSV file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }}
              />
              <span className="text-xs text-muted-foreground">or paste below</span>
              {orders !== null && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {orders.length} pending order{orders.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={'mrn,wbc,hb,plt\nMRN-ABC123,6.2,14.1,250'}
              spellCheck={false}
              className="w-full h-28 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {parsed?.noMrnHeader && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                No MRN column found — the header row needs an “mrn” (or “patient_id”) column.
              </p>
            )}

            {parsed && !parsed.noMrnHeader && (
              <div className="space-y-2">
                {parsed.map.unknown.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Ignored columns: {parsed.map.unknown.join(', ')}
                  </p>
                )}
                {parsed.capped && (
                  <p className="text-[11px] text-amber-600">
                    Large file — only the first {ROW_CAP} rows are processed per import.
                  </p>
                )}
                <div className="max-h-48 overflow-y-auto rounded-md border divide-y divide-border">
                  {parsed.matched.map(row => {
                    const order = orderById.get(row.order.actionId)
                    return (
                      <div key={row.rowIndex} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="font-medium truncate">{order?.patientLabel ?? row.mrn}</span>
                        <span className="text-muted-foreground font-mono shrink-0">{row.mrn}</span>
                        <span className="ml-auto text-muted-foreground shrink-0">
                          {row.valueCount} value{row.valueCount === 1 ? '' : 's'}
                          {Object.keys(row.extraValues).length > 0 &&
                            ` · ${Object.keys(row.extraValues).length} outside order`}
                        </span>
                      </div>
                    )
                  })}
                  {parsed.unmatched.map(row => (
                    <div key={`u${row.rowIndex}`} className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-mono truncate">{row.mrn || `row ${row.rowIndex + 2}`}</span>
                      <span className="ml-auto shrink-0">
                        {row.reason === 'no-mrn' ? 'no MRN' : 'no pending order'}
                      </span>
                    </div>
                  ))}
                  {parsed.matched.length === 0 && parsed.unmatched.length === 0 && (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">No data rows found.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={releasing} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!parsed || parsed.noMrnHeader || parsed.matched.length === 0 || releasing}
                onClick={() => void release()}
                className={cn(releasing && 'pointer-events-none')}
              >
                {releasing
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Releasing {progress}/{parsed?.matched.length ?? 0}…</>
                  : <>Release {parsed?.matched.length ?? 0} result{(parsed?.matched.length ?? 0) === 1 ? '' : 's'}</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
