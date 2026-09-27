// What the center folds entries with (chart-plan.md §1.4): the registry's types and the services (an order's steps), who reads where
// (whose review rows count), the record's orders and review rows, and the versions the client holds — the lists' entries and the
// facts' cross-outs — so a change draws the dose before it and an item crossed out elsewhere is struck here too.
import { useMemo } from 'react'
import { useDepartment } from '../../../hooks/organization'
import { listPool } from '../model/encounter'
import { baseOf, type ItemCtx } from '../model/items'
import { useChart } from '../context'

export function useItemCtx(newSince?: string): ItemCtx {
  const c = useChart(); const { org } = useDepartment(); const s = c.r.server; const types = org?.types
  return useMemo(() => ({ types, services: org?.services, me: c.me, departmentId: c.departmentId, orders: s.tables['base.orders'], reviews: s.tables['base.review']?.rows,
    pool: [...listPool(s), ...(c.facts ?? []).filter((e) => baseOf(e.type, types) === 'crossed_out')], newSince }), [types, org, c.me, c.departmentId, s, c.facts, newSince])
}
