// Times and small helpers, moved as they were from the kit's index (design-system.md §4.0). Pure: no window at import, so the
// chart's model and its node tests import this file directly (never the barrel).
import type { MouseEvent } from 'react'

export const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)
/** the mouse really moved: a browser also sends mousemove when a list shifts under a still pointer (typing a filter), and
 *  that one must not bring hover back while the keys are in use */
export const movedMouse = (e: MouseEvent) => e.movementX !== 0 || e.movementY !== 0
export const minutesSince = (iso: string | null) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0

// times are stored in UTC; people read them in the clinic's time zone (set once the organization loads) — never cut an ISO string
let zone: string | undefined
export const setClinicTimeZone = (tz: string | undefined) => { zone = tz || undefined }
const parts = (iso: string) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
/** 14:05 */
export const hm = (iso: string) => { const p = parts(iso); return `${p.hour}:${p.minute}` }
/** 2026-09-24, the clinic's date: for grouping by day and for dates */
export const ymd = (iso: string) => { const p = parts(iso); return `${p.year}-${p.month}-${p.day}` }
/** 2026-09-24 14:05 */
export const dateTime = (iso: string) => `${ymd(iso)} ${hm(iso)}`
/** 24 Sep 2026 */
export const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' })
/** 12 Jun (this year) · Jun 2024 (earlier) */
export const shortDate = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString(undefined, ymd(iso).slice(0, 4) === ymd(new Date().toISOString()).slice(0, 4) ? { timeZone: zone, day: 'numeric', month: 'short' } : { timeZone: zone, month: 'short', year: 'numeric' }) }
