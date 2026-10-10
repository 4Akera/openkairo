// Dialysis's words on each chair's tile (spec/openCare.md §5.6; the owner's C1 through the core's tile read, C7): the pack's op
// haemodialysis.board reads, once per board, each stay's session (with the fluid to take off and the dry weight Before copied), its latest
// blood pressure and fluid taken off, the weight before and the last session's weight after, and the patient's isolation. The tile says
// the session ("on · 1:30 left", "over by 0:10" in amber, "ended · not discharged" or "no session" in amber), "off 1.4 of 2.8 L" once
// there is a target, the dialysis event of the last hour ("low BP, cramps": red with Low BP, else amber), "BP 146/84" (amber under 100
// systolic, red under 90), "gained 2.3 kg" in amber over 4 % of the dry weight, and a chair that does not fit the patient's isolation,
// in amber. Pure: npm run test:haemodialysis.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { eventIsRecent, eventWords } from './event'
import { chairWarning, keptFor, unitOf } from './unit'

export interface StayFacts {
  session?: { item: string; status: string; on?: string; shift?: number; hours?: number; started?: string; target?: number; dry?: number }
  bp?: { sys: number; dia: number; at: string }; uf?: { ml: number; at: string }; pre?: number; last?: number; event?: { heading: string; at: string }
  isolation?: string[]
}
/** now: the read's clock (the board's hook moves it each minute so the tiles' time words move; the line reads the time itself) */
export interface Board { patient_ids: string[]; stays: Record<string, StayFacts>; now?: number }
/** the op's answer, or null when it is not one */
export function boardOf(data: unknown): Board | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { patient_ids?: unknown; stays?: unknown }
  if (!d.stays || typeof d.stays !== 'object' || Array.isArray(d.stays)) return null
  return { patient_ids: Array.isArray(d.patient_ids) ? d.patient_ids.filter((x): x is string => typeof x === 'string') : [], stays: d.stays as Record<string, StayFacts> }
}
/** the board's stays as its read's key: read again when a stay changes or has its first vitals */
export const staysKey = (rows: readonly Pick<PresenceRow, 'item' | 'version' | 'has_vitals'>[]) => rows.map((r) => `${r.item}@${r.version}:${r.has_vitals ? 1 : 0}`).sort().join(',')
/** litres in words: 2800 → "2.8", 2000 → "2", 0 → "0" */
export const litres = (ml: number) => String(Math.round(ml / 100) / 10)
/** minutes as 'H:MM' */
export function hmm(min: number): string {
  const m = Math.max(0, Math.floor(min)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

function sessionWord(s: StayFacts['session'], now: number): string | TileWord {
  if (!s) return { text: 'no session', tone: 'warn' }
  if (s.status === 'completed' || s.status === 'stopped') return { text: 'ended · not discharged', tone: 'warn' }
  if (s.status !== 'in-progress') return { text: 'no session', tone: 'warn' }
  const started = s.started ? Date.parse(s.started) : NaN
  if (!Number.isFinite(started)) return 'on'
  const elapsed = Math.floor((now - started) / 60_000)
  if (typeof s.hours !== 'number' || !(s.hours > 0)) return `on · ${hmm(elapsed)}`
  const left = Math.round(s.hours * 60) - elapsed
  return left >= 0 ? `on · ${hmm(left)} left` : { text: `over by ${hmm(-left)}`, tone: 'warn' }
}
function bpWord(bp: StayFacts['bp']): string | TileWord | null {
  if (!bp || typeof bp.sys !== 'number' || typeof bp.dia !== 'number') return null
  const text = `BP ${bp.sys}/${bp.dia}`
  return bp.sys < 90 ? { text, tone: 'danger' } : bp.sys < 100 ? { text, tone: 'warn' } : text
}
const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : undefined
/** "off 1.4 of 2.8 L" once Before set the fluid to take off ("off 0 of 2.8 L" before the first reading) */
function fluidWord(f: StayFacts): string | null {
  const target = n(f.session?.target); if (target === undefined) return null
  return `off ${litres(n(f.uf?.ml) ?? 0)} of ${litres(target)} L`
}
/** the weight gained since the last session, in amber over 4 % of the dry weight */
export const GAIN_SHARE = 0.04
function gainedWord(f: StayFacts): TileWord | null {
  const pre = n(f.pre); const last = n(f.last); const dry = n(f.session?.dry)
  if (pre === undefined || last === undefined || dry === undefined) return null
  const g = pre - last
  return g > GAIN_SHARE * dry ? { text: `gained ${g.toFixed(1)} kg`, tone: 'warn' } : null
}
/** the tile's words for an admitted stay, from the board's read; nothing while it reads (or failed), or for a visit */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'place' | 'org' | 'dept'>, data: unknown, now: number): TileWords | null {
  if (row.kind !== 'stay' || row.state !== 'admitted') return null
  const b = boardOf(data)
  // a stay the read has not seen yet (it came after the read): nothing until the next one
  if (!b || !Object.hasOwn(b.stays, row.item)) return null
  const f = b.stays[row.item] ?? {}
  const words: (string | TileWord)[] = [sessionWord(f.session, now)]
  const fluid = fluidWord(f); if (fluid) words.push(fluid)
  // the event of the last hour, before the BP: the pressure is the alarm, the event says what was done about it
  const ev = f.event && typeof f.event.heading === 'string' && eventIsRecent(f.event.at, now) ? eventWords(f.event.heading) : null; if (ev) words.push(ev)
  const bp = bpWord(f.bp); if (bp) words.push(bp)
  const gained = gainedWord(f); if (gained) words.push(gained)
  if (ctx.place?.name) {
    const warn = chairWarning(Array.isArray(f.isolation) ? f.isolation : [], keptFor(ctx.place, unitOf(ctx.org, ctx.dept.id)), ctx.place.name)
    if (warn) words.push({ text: warn, tone: 'warn' })
  }
  return { words }
}
