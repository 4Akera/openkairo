// Bookings' decisions, pure (spec/openCare.md §5.7): how long "/book 3m" is, the nearest free places to a day, a session's places on a
// day, which of a bench's orders wait to be booked, a row's place on its list, the words on a row and an order, the bench's To book
// group. No React and no reads here, so a node test imports it (npm run test:bookings).
import type { OrderRow } from '@core/db/types'
import type { OrderWord, PackRow } from '@core/screens/rows'

export type How = 'time' | 'number'
export interface Session { id: string; name: string; days: string[]; from: string; to: string; how: How; every?: number; places?: number; doctor_id?: string; place_id?: string
  overbook?: number; walk_ins?: number; services?: string[] }
export interface FreeSession { session_id: string; name: string; day: string; how: How; from: string; to: string; every: number | null; doctor_id: string | null
  place_id: string | null; services: string[]; capacity: number; booked: number; left: number; overbook_left?: number; next_number: number | null; times: { at: string; taken: boolean }[] | null }
export type State = 'booked' | 'here' | 'cancelled' | 'missed'
/** a booking as the places read gives it, by order */
export interface Placed { day: string; starts_at: string; number: number | null; state: State; session_id: string; department_id: string }
export interface Places { visits: Record<string, { at: string; number: number | null; session: string }>; orders: Record<string, Placed>; today: string; now: string; books: 'any' | string[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** a day as the desk says it: "Sun 11 Oct" (a YYYY-MM-DD, read as a calendar day) */
export function dayWords(day: string) { const [y, m, d] = day.slice(0, 10).split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return `${DAYS[w]} ${d} ${MONTHS[m - 1]}` }
/** a time on the clinic's clock: "10:30" */
export const timeWords = (iso: string, tz = 'Africa/Cairo') => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso))
/** where in its session: "No. 6" or "10:30" */
export const placeWords = (b: { number: number | null; starts_at: string }, tz?: string) => b.number != null ? `No. ${b.number}` : timeWords(b.starts_at, tz)
/** the clinic's today, as a YYYY-MM-DD */
export const todayOf = (tz = 'Africa/Cairo', now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
export const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** a day's word as sessions name it: "sun" */
export const dowOf = (day: string) => { const [y, m, d] = day.split('-').map(Number); return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }

/** "3m" → 91 days, "2w" → 14, "10d" → 10, "1y" → 365, "tue" → the days to the next Tuesday (a week when today is one); nothing → a week;
 *  anything else → null (the card asks again) */
export function inDays(text: string, today = 'sun'): number | null {
  const t = text.trim().toLowerCase(); if (!t) return 7
  const m = /^(\d{1,3})\s*(d|w|m|y)?$/.exec(t)
  if (m) { const n = Number(m[1]); if (!n) return null; return m[2] === 'w' ? n * 7 : m[2] === 'm' ? Math.round(n * 30.4) : m[2] === 'y' ? n * 365 : n }
  const w = DOW.findIndex((d) => t.length >= 3 && d.startsWith(t.slice(0, 3)))
  if (w >= 0) { const d = (w - DOW.indexOf(today) + 7) % 7; return d === 0 ? 7 : d }
  return null
}
/** 91 → "3 months", 14 → "2 weeks", 10 → "10 days" */
export function inWords(n: number) {
  const months = Math.round(n / 30.4)
  if (n >= 28 && Math.abs(n - months * 30.4) <= 1) return `${months} month${months === 1 ? '' : 's'}`
  if (n % 7 === 0) return `${n / 7} week${n === 7 ? '' : 's'}`
  return `${n} day${n === 1 ? '' : 's'}`
}

/** the nearest free places to a day: one a session and day (its next number, or its first free time), nearest first, then the earlier */
export function nearest(sessions: FreeSession[], target: string, n = 4, tz?: string) {
  const dist = (d: string) => Math.abs(Date.parse(d) - Date.parse(target))
  return sessions.filter((s) => s.left > 0 && (s.how === 'number' || (s.times ?? []).some((t) => !t.taken)))
    .sort((a, b) => dist(a.day) - dist(b.day) || a.day.localeCompare(b.day) || a.from.localeCompare(b.from)).slice(0, n)
    .map((s) => { const at = s.how === 'time' ? s.times!.find((t) => !t.taken)!.at : undefined
      return { s, at, label: `${dayWords(s.day)} · ${s.how === 'number' ? `No. ${s.next_number}` : timeWords(at!, tz)}` } })
}

/** a session's places on a day: its times, or its numbers 1…places (and any number given past them, overbooked), each with its bookings */
export function placesOf<B extends { session_id: string; day: string; number: number | null; starts_at: string }>(s: Session, day: string, rows: B[], tz?: string): { at: string; b: B[] }[] {
  const mine = rows.filter((b) => b.session_id === s.id && b.day === day)
  if (s.how === 'number') {
    const n = Math.max(s.places ?? 0, ...mine.map((b) => b.number ?? 0))
    return Array.from({ length: n }, (_, i) => ({ at: `No. ${i + 1}`, b: mine.filter((b) => b.number === i + 1) }))
  }
  const [fh, fm] = s.from.split(':').map(Number); const [th, tm] = s.to.split(':').map(Number); const every = s.every ?? 15; const out: { at: string; b: B[] }[] = []
  for (let t = fh * 60 + fm; t + every <= th * 60 + tm; t += every) {
    const at = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    out.push({ at, b: mine.filter((b) => timeWords(b.starts_at, tz) === at) })
  }
  // a booking made before the session's hours changed keeps its time: it shows at it, off the grid, never lost
  const off = mine.filter((b) => !out.some((x) => x.b.includes(b)))
  for (const b of off) out.push({ at: timeWords(b.starts_at, tz), b: [b] })
  return off.length ? out.sort((x, y) => x.at.localeCompare(y.at)) : out
}
/** how many a session holds: its places, or its times */
export const capacityOf = (s: Session) => s.how === 'number' ? s.places ?? 0
  : Math.floor(((+s.to.slice(0, 2) * 60 + +s.to.slice(3)) - (+s.from.slice(0, 2) * 60 + +s.from.slice(3))) / (s.every ?? 15))

/** does a session of this bench book the order's service (a session naming none books any) */
export const books = (p: Pick<Places, 'books'>, service: string | null) => p.books === 'any' || (!!service && p.books.includes(service))
/** a row's orders still to book: not started, a service a session books, no standing booking (or a missed one) */
export const toBook = (row: Pick<PackRow, 'orders'>, p: Places): OrderRow[] =>
  row.orders.filter((o) => (o.step ?? 'sent') === 'sent' && books(p, o.service_id) && (!p.orders[o.item] || p.orders[o.item].state === 'missed'))
/** a row's place on its list (core change (h)): the queue's visit at its booked time or number; a bench's patient at today's booked order */
export function placeOfRow(row: Pick<PackRow, 'visit_id' | 'orders'>, p: Places): string | null {
  if (row.visit_id && p.visits[row.visit_id]) return p.visits[row.visit_id].at
  return row.orders.map((o) => p.orders[o.item]).filter((b) => b && b.day === p.today && (b.state === 'booked' || b.state === 'here')).map((b) => b!.starts_at).sort()[0] ?? null
}
/** the words (core change (l)): "booked · No. 5" on a booked visit's queue row; on an order "booked · Sun 11 Oct 10:00" (today: the time
 *  alone), "missed · Wed 7 Oct", "here" */
export function wordsOfRow(row: Pick<PackRow, 'visit_id' | 'orders'>, p: Places, tz?: string): OrderWord[] {
  const out: OrderWord[] = []
  if (row.visit_id && p.visits[row.visit_id]) { const v = p.visits[row.visit_id]; out.push({ word: `booked · ${v.number != null ? `No. ${v.number}` : timeWords(v.at, tz)}`, tone: 'info' }) }
  for (const o of row.orders) {
    const b = p.orders[o.item]; if (!b) continue
    if (b.state === 'missed') out.push({ order: o.item, word: `missed · ${dayWords(b.day)}`, tone: 'danger' })
    else if (b.state === 'here') out.push({ order: o.item, word: 'here', tone: 'ok' })
    else out.push({ order: o.item, word: `booked · ${b.day === p.today ? '' : `${dayWords(b.day)} `}${placeWords(b, tz)}`, tone: 'info' })
  }
  return out
}
/** the bench's To book (core change (m)): an order for a service a session books, not booked yet (or missed) → To book; booked for a later
 *  day → Booked · coming; booked for today → none (it stays in To do, at its place). A walk-in started here or at the desk with Now is
 *  not to book: the patient is here (owner: "always offer Now") */
export function groupOf(order: string, row: Pick<PackRow, 'orders'>, p: Places, walkIn: (o: OrderRow) => boolean = () => false): string | null {
  const o = row.orders.find((x) => x.item === order); if (!o || !books(p, o.service_id)) return null
  const b = p.orders[order]
  if (!b) return walkIn(o) ? null : 'To book'
  if (b.state === 'missed') return 'To book'
  return b.state === 'booked' && b.day > p.today ? 'Booked · coming' : null
}
