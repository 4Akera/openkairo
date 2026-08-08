// Pure helpers for the department work queue ("worklist") — lane grouping,
// STAT-first ordering, save-&-next chaining, and wait-time labels.
// Kept free of Supabase/React so they can be unit-tested.

/** Minimal structural shape of a queue row (block_action + joined order block). */
export interface WorklistOrder {
  id: string
  status: string
  triggered_at: string
  action_payload?: unknown
  order_block?: {
    order_def?: { name?: string | null } | null
    order_block_type?: { name?: string | null } | null
  } | null
  /** Joined encounter — carries the queue the patient sits in (the order's origin). */
  encounter?: {
    department_id?: string | null
    departments?: { name?: string | null } | null
  } | null
}

export const OTHER_LANE = 'Other'
export const GENERAL_ORIGIN = 'General'

const OPEN_DONE = new Set(['completed', 'cancelled'])

export function isStatOrder(o: WorklistOrder): boolean {
  const payload = o.action_payload as { priority?: string } | null | undefined
  return payload?.priority === 'stat'
}

/**
 * Lane = the service/test name the order was placed against. Resolution order:
 * the request block's joined service name, the ordered service id in the
 * action payload (resolved via `blockTypeNames`), the order definition name.
 */
export function laneOf(o: WorklistOrder, blockTypeNames?: ReadonlyMap<string, string>): string {
  const fromJoin = o.order_block?.order_block_type?.name?.trim()
  if (fromJoin) return fromJoin
  const btId = (o.action_payload as { block_type_id?: string } | null | undefined)?.block_type_id
  const fromPayload = btId ? blockTypeNames?.get(btId)?.trim() : undefined
  if (fromPayload) return fromPayload
  return o.order_block?.order_def?.name?.trim() || OTHER_LANE
}

export interface LaneCount {
  lane: string
  count: number
  statCount: number
}

/** Per-lane counts for the chip strip, busiest lane first (ties: A→Z). */
export function laneCounts(
  orders: WorklistOrder[],
  blockTypeNames?: ReadonlyMap<string, string>,
): LaneCount[] {
  const map = new Map<string, LaneCount>()
  for (const o of orders) {
    const lane = laneOf(o, blockTypeNames)
    const entry = map.get(lane) ?? { lane, count: 0, statCount: 0 }
    entry.count += 1
    if (isStatOrder(o)) entry.statCount += 1
    map.set(lane, entry)
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.lane.localeCompare(b.lane),
  )
}

/**
 * Origin = where the order came FROM: the queue its encounter sits in
 * ("Cardiology", "General" when none). This is the extension point for
 * inpatient locations later — a ward/building/floor becomes just another
 * origin label; the filter UI stays the same.
 */
export function originOf(o: WorklistOrder): string {
  return o.encounter?.departments?.name?.trim() || GENERAL_ORIGIN
}

export interface OriginCount {
  origin: string
  count: number
}

/** Per-origin counts for the filter, busiest first (ties: A→Z). */
export function originCounts(orders: WorklistOrder[]): OriginCount[] {
  const map = new Map<string, OriginCount>()
  for (const o of orders) {
    const origin = originOf(o)
    const entry = map.get(origin) ?? { origin, count: 0 }
    entry.count += 1
    map.set(origin, entry)
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.origin.localeCompare(b.origin),
  )
}

/** STAT orders pinned on top; within each group, oldest first. */
export function sortWorklist<T extends WorklistOrder>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const stat = Number(isStatOrder(b)) - Number(isStatOrder(a))
    if (stat !== 0) return stat
    return new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime()
  })
}

/**
 * The order a tech should handle after `current`: the next open order in the
 * same lane, in worklist order. Null when the lane is done.
 */
export function nextInLane<T extends WorklistOrder>(
  orders: T[],
  current: WorklistOrder,
  blockTypeNames?: ReadonlyMap<string, string>,
): T | null {
  const lane = laneOf(current, blockTypeNames)
  const candidates = sortWorklist(
    orders.filter(
      o =>
        o.id !== current.id &&
        !OPEN_DONE.has(o.status) &&
        laneOf(o, blockTypeNames) === lane,
    ),
  )
  return candidates[0] ?? null
}

/** Compact age label for queue rows: "12m", "3h 05m", "2d". */
export function waitedLabel(triggeredAt: string, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(triggeredAt).getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const rem = mins % 60
    return rem === 0 ? `${hours}h` : `${hours}h ${String(rem).padStart(2, '0')}m`
  }
  return `${Math.floor(hours / 24)}d`
}
