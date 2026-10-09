// Dialysis's word on the patient's banner (spec/openCare.md §5.6, D2c): while the patient's stay here is open and its session is on,
// "off 1.4 of 2.8 L" (the fluid taken off of the fluid to take off), or "on dialysis" before Before set a target. Only where the
// department uses the pack (the banner asks only those). Pure: npm run test:haemodialysis.
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import { litres } from './board'
import { qv, type SessionData } from './session'

export function sessionBanner(x: Pick<WordsInput, 'rec' | 'ctx' | 'own'>): BannerWord[] {
  const stay = x.rec.tables['base.presence']?.rows.find((r) => r.kind === 'stay' && r.state === 'admitted' && r.department_id === x.ctx.departmentId)
  if (!stay) return []
  // own.shown: each item's latest version, the newest first
  const session = x.own.shown.find((e) => e.type === 'haemodialysis.session' && e.visit_id === stay.item)
  const data = session?.data as SessionData | undefined
  if (!data || data.status !== 'in-progress') return []
  const target = qv(data.haemodialysis?.target)
  if (target === undefined) return [{ word: 'on dialysis', rank: 1 }]
  const uf = x.own.shown.filter((e) => e.type === 'haemodialysis.reading' && e.visit_id === stay.item).map((e) => qv((e.data as { haemodialysis?: { uf?: unknown } } | undefined)?.haemodialysis?.uf))
    .find((v) => v !== undefined)
  return [{ word: `off ${litres(uf ?? 0)} of ${litres(target)} L`, rank: 1 }]
}
