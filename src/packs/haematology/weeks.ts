// The INR clinic's own entries as the sections and the card read them (spec/openCare.md §5.7): the plan (the reason, the target, the
// medicine, the tablet) and each week (the seven days' doses, the INR it was set at, the next INR). Pure.
import type { ServerEntry } from '@core/db/types'
import type { Target } from './inr'

export const INR = 'loinc:6301-6'
const newest = (a: { occurred_at: string }, b: { occurred_at: string }) => b.occurred_at.localeCompare(a.occurred_at)
export interface Plan { reason: string; target: Target; medicine?: string; tablet_mg?: number; at: string }
export const planOf = (own: ServerEntry[]): Plan | null => { const e = own.filter((x) => x.type === 'haematology.plan').sort(newest)[0]
  return e && e.data?.status !== 'stopped' ? { ...(e.data as unknown as Omit<Plan, 'at'>), at: e.occurred_at } : null }
export interface Week { days: number[]; was?: number; inr?: number; next_inr?: string; at: string; id: string }
export const weeksOf = (own: ServerEntry[]): Week[] => own.filter((x) => x.type === 'haematology.week').sort(newest)
  .map((e) => ({ ...(e.data as unknown as Omit<Week, 'at' | 'id'>), at: e.occurred_at, id: e.id }))
