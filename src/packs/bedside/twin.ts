// The client's twin of the round's rule (spec/openCare.md §5.6, piece 3b): bedside.stay_doses (R2–R8) worked out from the record the
// chart has already read, for three words only — the banner's "1 dose late", the Treatment sheet's chip and its Summary line — because
// banner words read the record alone (a pack cannot call its op there without a core change, §5.6 question 2). Its medicines are the
// record's medication list rows and their versions, its doses the section's own given entries naming one of them (never a
// transfusion or a vaccine dose, which extend given too). Known drift, kept small: the list leaves out a medicine whose latest version a
// patient or a machine wrote, which the server counts; the twin never adds one. The round, the sheet and the tile read the server's op.
// npm run test:drug-round runs the SQL suite's own case through it. Pure.
import type { EntryData } from '@core/db/shapes.generated'
import type { Organization, ServerEntry } from '@core/db/types'
import type { Rec } from '@core/screens/chart/model/record'
import type { Own } from '@core/screens/chart/sections'
import { openStay } from './news2'
import { COVER_MIN, PER_DAY, addDays, halfHours, isNight, localYmd, roundOf, timingOf, zoned, type Round, type SlotState } from './schedule'

export interface MedVersion { id: string; item: string; item_version: number; occurred_at: string; visit_id: string | null; data: Partial<EntryData['medication']> }
export interface GivenDose { id: string; occurred_at: string; data: { medication?: string; status?: string; bedside?: { due?: string } } }
export interface Slot { item: string; due: number; first: boolean; state: SlotState; dose?: string }
const H = 3_600_000; const DAY = 24 * H
const t = (iso: string) => new Date(iso).getTime()
const NAMED = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/** R2–R8 for one stay between two moments, step by step as bedside.stay_doses */
export function readingOf(vs: MedVersion[], doses: GivenDose[], stay: string, r: Round, zone: string, from: number, to: number, now: number): { slots: Slot[]; unset: string[]; elsewhere: string[] } {
  const late = r.late_after * 60_000
  const tim = (timing: string | null) => r.times.filter((x) => x.timing === timing).flatMap((x) => x.at.trim().split(/\s+/)).filter(Boolean)
  const byItem = new Map<string, MedVersion[]>()
  for (const v of vs) byItem.set(v.item, [...(byItem.get(v.item) ?? []), v])
  const slots: Slot[] = []; const unset: string[] = []; const elsewhere: string[] = []
  type Per = MedVersion & { timing: string | null; prn: boolean; night: boolean; until: number | null }
  const per = new Map<string, Per[]>()
  for (const [item, all] of byItem) {
    const sorted = [...all].sort((a, b) => a.item_version - b.item_version); const latest = sorted[sorted.length - 1]
    const ver = sorted.filter((v) => v.data.basis === 'prescribed')
    const firstHere = ver.find((v) => v.visit_id === stay)
    if (!firstHere) { if (latest.data.basis === 'prescribed' && latest.data.status === 'active') elsewhere.push(item); continue }
    const mine = ver.filter((v) => v.item_version >= firstHere.item_version)
    per.set(item, mine.map((v, i) => { const timing = timingOf(v.data.dosage?.timing?.code)
      return { ...v, timing, prn: !!v.data.dosage?.as_needed, night: isNight(timing, v.data.instructions), until: mine[i + 1] ? t(mine[i + 1].occurred_at) : null } }))
  }
  const firsts = [...per.values()].flat().map((p) => t(p.occurred_at))
  const startDay = [addDays(localYmd(from, zone), -2), ...(firsts.length ? [localYmd(Math.min(...firsts), zone)] : [])].sort()[0]
  const days: string[] = []; for (let d = startDay; d <= addDays(localYmd(to, zone), 1); d = addDays(d, 1)) days.push(d)
  const winOf = new Map<string, { due: number; first: boolean }[]>(); const timingOfItem = new Map<string, string | null>(); const live = new Set<string>()
  for (const [item, ps] of per) {
    const l = ps[ps.length - 1]; timingOfItem.set(item, l.timing); if (l.data.status === 'active') live.add(item)
    if (l.data.status === 'active' && !l.prn && !['stat', 'once'].includes(l.timing ?? '') && !l.night && !tim(l.timing).length) unset.push(item)
    const sch = ps.filter((p) => p.data.status === 'active' && !p.prn).flatMap((p) => days.flatMap((d) => (p.night ? [r.night] : tim(p.timing)).map((hm) => zoned(d, hm, zone)))
      .filter((due) => due >= t(p.occurred_at) && (p.until === null || due < p.until)))
    const f = ps.find((p) => p.item_version === 1 && p.data.status === 'active' && !p.prn && !p.night && (['stat', 'once'].includes(p.timing ?? '') || tim(p.timing).length > 0))
    const fs = f ? t(f.occurred_at) : null
    const keep = sch.filter((due) => fs === null || !(due > fs - late && due <= fs + Math.max(2 * late, (COVER_MIN[f!.timing ?? ''] ?? 0) * 60_000)))
    const all = [...keep.map((due) => ({ due, first: false })), ...(fs !== null ? [{ due: fs, first: true }] : [])].sort((a, b) => a.due - b.due)
    const course = PER_DAY[l.timing ?? ''] && Number.isInteger(l.data.duration_days) ? PER_DAY[l.timing ?? ''] * (l.data.duration_days as number) : null
    winOf.set(item, all.filter((_, i) => course === null || i < course).filter((s) => s.due >= from - DAY && s.due < to + DAY))
  }
  // R7: the doses naming one of these medicines, within two days of the window
  const items = new Set([...per.keys(), ...elsewhere])
  const ds = doses.filter((d) => items.has(d.data.medication ?? '') && t(d.occurred_at) >= from - 2 * DAY && t(d.occurred_at) < to + 2 * DAY)
    .map((d) => ({ ...d, at: t(d.occurred_at), named: NAMED.test(d.data.bedside?.due ?? '') ? t(d.data.bedside!.due!) : null, done: d.data.status === 'completed' }))
  const took = new Map<string, (typeof ds)[number]>(); const used = new Set<string>()
  const key = (item: string, due: number) => `${item}|${due}`
  for (const [item, w] of winOf) for (const s of w) {
    const named = ds.filter((d) => d.data.medication === item && d.named === s.due).sort((a, b) => Number(b.done) - Number(a.done) || a.at - b.at || a.id.localeCompare(b.id))
    if (named[0]) { took.set(key(item, s.due), named[0]); used.add(named[0].id) }
  }
  const near: { d: (typeof ds)[number]; item: string; due: number; gap: number }[] = []
  for (const d of ds) {
    const item = d.data.medication!
    // a dose naming one of its medicine's times that another dose outranked is extra, never matched by nearness
    if (used.has(d.id) || (d.named !== null && (winOf.get(item) ?? []).some((s) => s.due === d.named))) continue
    const half = halfHours(timingOfItem.get(item)) * H
    const c = (winOf.get(item) ?? []).filter((s) => !took.has(key(item, s.due)) && Math.abs(d.at - s.due) <= half)
      .map((s) => ({ d, item, due: s.due, gap: Math.abs(d.at - s.due) })).sort((a, b) => a.gap - b.gap || a.due - b.due)
    if (c[0]) near.push(c[0])
  }
  near.sort((a, b) => a.gap - b.gap || a.d.at - b.d.at || a.d.id.localeCompare(b.d.id))
  for (const n of near) if (!took.has(key(n.item, n.due))) took.set(key(n.item, n.due), n.d)
  for (const [item, w] of winOf) for (const s of w) {
    if (s.due < from || s.due >= to) continue
    const d = took.get(key(item, s.due))
    const state: SlotState = d ? (d.data.status === 'not-done' ? 'not_given' : 'given') : now < (s.first ? s.due : s.due - H) ? 'upcoming'
      : !live.has(item) ? 'missed' : now < s.due + late ? 'due' : s.due >= now - DAY ? 'late' : 'missed'
    slots.push({ item, due: s.due, first: s.first, state, ...(d ? { dose: d.id } : {}) })
  }
  return { slots: slots.sort((a, b) => a.due - b.due), unset, elsewhere }
}

/** the record's medication list rows (current, not crossed out) and every version of each */
export function stayVersions(rec: Rec): MedVersion[] {
  const tbl = rec.tables['base.lists']; if (!tbl) return []
  return tbl.rows.filter((x) => x.list === 'medications').flatMap((x) => x.source_entries.map((id) => tbl.entries[id]).filter((e): e is ServerEntry => !!e && e.type !== 'crossed_out' && !!e.data)
    .map((e) => ({ id: e.id, item: e.item, item_version: e.item_version, occurred_at: e.occurred_at, visit_id: e.visit_id, data: e.data as MedVersion['data'] })))
}
/** the section's own given entries (any type extending given) naming one of these medicines: never a transfusion or a vaccine */
export function givenDoses(own: Own, items: ReadonlySet<string>): GivenDose[] {
  return own.shown.filter((e) => typeof e.data?.medication === 'string' && items.has(e.data.medication as string))
    .map((e) => ({ id: e.id, occurred_at: e.occurred_at, data: e.data as GivenDose['data'] }))
}
/** the open stay's doses late and due, and its medicines with no times set, from 25 hours ago to 2 hours ahead; no open stay, null */
export function lateIn(rec: Rec, own: Own, org: Organization | undefined, now = Date.now()): { late: number; due: number; unset: number } | null {
  const stay = openStay(rec); if (!stay) return null
  // only a stay on a ward that uses Ward nursing has a round: elsewhere its doses are never timed, so none is late
  if (!org?.allDepartments.find((d) => d.id === stay.department_id)?.packs?.includes('bedside')) return null
  const vs = stayVersions(rec); const doses = givenDoses(own, new Set(vs.map((v) => v.item)))
  const x = readingOf(vs, doses, stay.item, roundOf(org, stay.department_id), org?.organization.time_zone ?? 'Africa/Cairo', now - 25 * H, now + 2 * H, now)
  return { late: x.slots.filter((s) => s.state === 'late').length, due: x.slots.filter((s) => s.state === 'due').length, unset: x.unset.length }
}
