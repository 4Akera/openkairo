import { useState, useCallback, useEffect, useMemo } from 'react'
import type { BlockDefinition, Charge } from '../../../types'
import { useBillingStore } from '../../../stores/billingStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { Button, Input, Label } from '../../ui'
import { cn } from '../../../lib/utils'
import {
  ChevronDown, ChevronRight, DollarSign, Loader2, Plus, Trash2, Ban,
} from 'lucide-react'

type DraftRow = {
  key: string
  service_item_id: string
  description: string
  unit_price: string
  quantity: number
}

function newDraft(): DraftRow {
  return {
    key: `d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    service_item_id: '',
    description: '',
    unit_price: '',
    quantity: 1,
  }
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  block_auto: 'Auto',
  encounter_close: 'Encounter',
  department: 'Department',
}

/** Manual lines past this point are treated as approved/posted — void only from full billing, not block fees */
const BLOCK_MANUAL_VOIDABLE_STATUSES = new Set<Charge['status']>(['pending_approval'])

/**
 * Per-block fee lines (timeline). Shown only when the block definition has `config.billing.allow_manual_block_fees` and org billing is on.
 */
export function BlockManualFeesPanel({
  blockId,
  patientId,
  encounterId,
  definition,
  charges,
  allowFeeEdits,
  onVoidCharge,
  onPosted,
}: {
  blockId: string
  patientId: string
  encounterId: string | null
  definition: BlockDefinition | null | undefined
  charges: Charge[]
  /** Add rows, post, and void manual lines */
  allowFeeEdits: boolean
  onVoidCharge?: (chargeId: string) => void
  onPosted?: () => Promise<void>
}) {
  const { billingEnabled, currencySymbol } = useSettingsStore()
  const { serviceItems, fetchServiceItems, addCharge } = useBillingStore()

  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (billingEnabled && open && serviceItems.length === 0) fetchServiceItems()
  }, [billingEnabled, open, serviceItems.length, fetchServiceItems])

  const activeItems = useMemo(
    () => serviceItems.filter(s => s.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [serviceItems],
  )

  const blockFeesTotal = useMemo(
    () => charges.reduce((s, c) => s + c.quantity * c.unit_price, 0),
    [charges],
  )

  const addDraft = useCallback(() => {
    setDrafts(d => [...d, newDraft()])
  }, [])

  const removeDraft = useCallback((key: string) => {
    setDrafts(d => d.filter(x => x.key !== key))
  }, [])

  const updateDraft = useCallback((key: string, patch: Partial<DraftRow>) => {
    setDrafts(d => d.map(x => (x.key === key ? { ...x, ...patch } : x)))
  }, [])

  const postDrafts = useCallback(async () => {
    setError(null)
    const ready = drafts.filter(d => {
      const desc = d.description.trim()
      const price = parseFloat(d.unit_price)
      return desc.length > 0 && Number.isFinite(price) && price >= 0
    })
    if (ready.length === 0) {
      setError('Add at least one line with a description and unit price (0 or more).')
      return
    }
    const status =
      definition?.charge_mode === 'confirm' ? 'pending_approval' : 'pending'

    setPosting(true)
    try {
      for (const row of ready) {
        const sid = row.service_item_id.trim()
        const svc = sid ? activeItems.find(s => s.id === sid) : undefined
        const qty = Math.max(1, Math.floor(row.quantity) || 1)
        const unit = parseFloat(row.unit_price)
        const rowRes = await addCharge({
          patient_id: patientId,
          encounter_id: encounterId,
          block_id: blockId,
          service_item_id: svc?.id ?? null,
          description: row.description.trim(),
          quantity: qty,
          unit_price: unit,
          status,
          source: 'manual',
        })
        if (!rowRes) {
          setError('Could not save one or more lines. Check permissions and try again.')
          await onPosted?.()
          return
        }
      }
      setDrafts([])
      await onPosted?.()
    } finally {
      setPosting(false)
    }
  }, [
    drafts,
    activeItems,
    addCharge,
    patientId,
    encounterId,
    blockId,
    definition?.charge_mode,
    onPosted,
  ])

  if (!billingEnabled) return null

  const lineCount = charges.length

  return (
    <div className="border-b border-border/50 bg-gradient-to-b from-muted/30 via-muted/15 to-transparent dark:from-muted/25 dark:via-muted/10">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
          open ? 'bg-muted/40 dark:bg-muted/25' : 'hover:bg-muted/30 dark:hover:bg-muted/20',
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/[0.1] text-emerald-700 shadow-sm dark:border-emerald-800/45 dark:bg-emerald-950/45 dark:text-emerald-400">
          <DollarSign className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-tight text-foreground">Additional fees</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
            Catalogue quick-pick or a custom description and price
          </p>
        </div>
        {lineCount > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
            <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300">
              {lineCount} line{lineCount !== 1 ? 's' : ''}
            </span>
            {blockFeesTotal > 0 && (
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {currencySymbol}
                {blockFeesTotal.toFixed(2)}
              </span>
            )}
          </div>
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/50 bg-background/50 px-4 pb-4 pt-3 dark:bg-background/30">
          {charges.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                Posted on this entry
              </p>
              <ul className="space-y-1.5">
                {charges.map(c => {
                  const canVoidHere =
                    allowFeeEdits &&
                    onVoidCharge &&
                    c.source === 'manual' &&
                    BLOCK_MANUAL_VOIDABLE_STATUSES.has(c.status)
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-[11px] shadow-sm shadow-black/[0.02] dark:shadow-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {SOURCE_LABEL[c.source] ?? c.source}
                          {' · '}{c.quantity}× {currencySymbol}{c.unit_price.toFixed(2)}
                          {c.status === 'pending_approval' && ' · Awaiting approval'}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                        {currencySymbol}{(c.quantity * c.unit_price).toFixed(2)}
                      </span>
                      {canVoidHere && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          title="Void this line"
                          onClick={() => onVoidCharge(c.id)}
                        >
                          <Ban className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {allowFeeEdits && (
            <div className="space-y-2.5 rounded-xl border border-dashed border-emerald-400/35 bg-emerald-500/[0.06] px-3 py-3 dark:border-emerald-700/40 dark:bg-emerald-950/25">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-200/95">
                  Add lines
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-emerald-500/25 bg-background/80 text-[10px] gap-1 hover:bg-emerald-500/10 dark:border-emerald-800/50"
                  onClick={addDraft}
                >
                  <Plus className="h-3 w-3" /> Add row
                </Button>
              </div>

              {drafts.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Add rows with description and unit price. Optionally pick a service to pre-fill; you can edit both after.
                </p>
              )}

              <div className="space-y-3">
                {drafts.map(row => (
                  <div
                    key={row.key}
                    className="space-y-2 rounded-lg border border-border/60 bg-background p-2.5 shadow-sm shadow-black/[0.03] dark:bg-card/80 dark:shadow-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={row.service_item_id}
                        onChange={e => {
                          const id = e.target.value
                          if (!id) {
                            updateDraft(row.key, { service_item_id: '' })
                            return
                          }
                          const svc = activeItems.find(s => s.id === id)
                          if (svc) {
                            updateDraft(row.key, {
                              service_item_id: id,
                              description: svc.name,
                              unit_price: String(svc.default_price),
                            })
                          }
                        }}
                        className="h-8 min-w-[9rem] flex-1 rounded-md border border-border bg-background px-2 text-[11px]"
                      >
                        <option value="">Quick pick (catalogue)…</option>
                        {activeItems.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {currencySymbol}{s.default_price.toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={() => removeDraft(row.key)}
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_5.5rem_4rem] gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Description</Label>
                        <Input
                          placeholder="e.g. Extra consumables"
                          value={row.description}
                          onChange={e => updateDraft(row.key, { description: e.target.value })}
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Price</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          value={row.unit_price}
                          onChange={e => updateDraft(row.key, { unit_price: e.target.value })}
                          className="h-8 text-[11px] tabular-nums"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={e =>
                            updateDraft(row.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                          }
                          className="h-8 text-[11px] tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="text-[10px] text-destructive">{error}</p>}

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  disabled={posting || drafts.length === 0}
                  onClick={postDrafts}
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                  Post to billing
                </Button>
              </div>
            </div>
          )}

          {!allowFeeEdits && charges.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-1.5 leading-relaxed">
              No additional fees on this entry.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
