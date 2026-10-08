// /preop on the composer's line (spec/openCare.md §5.7, Q43): one draft, the pack's pre-op assessment, about the patient's operation
// as the chart last read it (its card, Preop.tsx, fills it). Pure.
import type { Ctx, Result } from '@core/screens/visit/parse'
import { PLANS } from './model'
import { seenOps } from './seen'

export function parsePreop(_rest: string, ctx: Ctx): Result {
  const op = seenOps(ctx.record?.patient?.id)[0]
  return { ok: [{ function: 'anaesthesia.preop', action: 'write:anaesthesia.preop', kind: 'assessment', line: `Pre-op assessment${op ? ` · ${op.name}` : ''}`,
    params: { ...(op ? { op: op.item, operation: op.name } : {}), asa: 'II', verdict: 'fit', history: {}, airway: {} } }] }
}
export const preopLine = (p: Record<string, unknown>) => {
  const plan = PLANS.find(([k]) => k === p.plan)?.[1]
  return ['Pre-op assessment', `ASA ${p.asa}${p.emergency ? ' E' : ''}`, (p.airway as { mallampati?: string } | undefined)?.mallampati && `Mallampati ${(p.airway as { mallampati: string }).mallampati}`,
    p.verdict === 'fit' ? 'fit' : 'not yet', plan && `${plan.toLowerCase()} planned`, Array.isArray(p.stop) && p.stop.length ? 'his medicines before the operation' : ''].filter(Boolean).join(' · ')
}

