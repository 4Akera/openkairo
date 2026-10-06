// A starter setup against a department, in words (spec/openCare.md §5.2 "Setup and guards"). Pure: the setup door's parts in, the
// summary and the rows Settings draws out. A part is to add (missing here), the same, differs (staff changed it: shown, never
// overwritten) or blocked (its pack is off for the clinic); only a part to add has Apply.
import type { SetupInfo, SetupPart } from '../../db/types'

const PLACE: Record<string, [string, string]> = { bed: ['bed', 'beds'], room: ['room', 'rooms'], chair: ['chair', 'chairs'], cubicle: ['cubicle', 'cubicles'] }
const KIND: Record<string, [string, string]> = { service: ['service', 'services'], preset: ['preset', 'presets'], setting: ['setting', 'settings'] }
const n = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`
const labelOf = (p: SetupPart) => ((p.want ?? {}) as { label?: string }).label ?? 'bed'

/** a list in words: "a", "a and b", "a, b and c" */
export const listWords = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`

/** what the parts to add come to, counted: "2 beds", "1 preset", in the order a setup applies them */
export function countsToAdd(parts: SetupPart[]): string[] {
  const add = parts.filter((p) => p.state === 'add')
  const places = Object.keys(PLACE).map((l): [number, [string, string]] => [add.filter((p) => p.kind === 'place' && labelOf(p) === l).length, PLACE[l]])
  return [...add.filter((p) => p.kind === 'setting').length ? [n(add.filter((p) => p.kind === 'setting').length, KIND.setting)] : [],
    ...places.filter(([c]) => c).map(([c, w]) => n(c, w)),
    ...(['service', 'preset'] as const).map((k): [number, [string, string]] => [add.filter((p) => p.kind === k).length, KIND[k]]).filter(([c]) => c).map(([c, w]) => n(c, w))]
}

/** the name a part goes by in a sentence: "Screens line", "Bed 4", "Kind of encounter" */
export const partName = (p: SetupPart) => p.kind === 'screens' ? 'Screens line' : p.kind === 'pack' ? `${p.name} tick` : p.name

/** the difference in one line: "would add 2 beds, 1 preset; your Screens line differs" */
export function summary(parts: SetupPart[]): string {
  const ticks = parts.filter((p) => p.kind === 'pack' && p.state === 'add').map((p) => `tick ${p.name}`)
  const counts = countsToAdd(parts)
  const line = parts.some((p) => p.kind === 'screens' && p.state === 'add') ? ['set the Screens line'] : []
  const verbs = [...ticks, ...counts.length ? [`add ${counts.join(', ')}`] : [], ...line]
  const differs = parts.filter((p) => p.state === 'differs').map(partName)
  const blocked = parts.filter((p) => p.state === 'blocked' && p.kind === 'pack').map((p) => p.name)
  const out = [verbs.length ? `would ${listWords(verbs)}` : 'nothing missing']
  if (differs.length === 1) out.push(`your ${differs[0]} differs`)
  else if (differs.length === 2) out.push(`your ${differs[0]} and ${differs[1]} differ`)
  else if (differs.length > 2) out.push(`your ${differs.slice(0, 2).join(', ')} and ${differs.length - 2} more differ`)
  if (blocked.length) out.push(`${listWords(blocked)} ${blocked.length === 1 ? 'is' : 'are'} off for the clinic`)
  return out.join('; ')
}

/** a setting's or a line's value in words: an enum as it is, yes or no, a list joined; an id or a key by the name given for it */
export function valueWords(v: unknown, name: (k: string) => string = (k) => k): string {
  if (v === null || v === undefined) return 'not set'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'string') return name(v)
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.length ? v.map((x) => valueWords(x, name)).join(', ') : 'none'
  const o = v as Record<string, unknown>
  if (Array.isArray(o.screens)) return `${valueWords(o.screens, name)}${o.opens && o.opens !== o.screens[0] ? `, opens on ${name(String(o.opens))}` : ''}`
  if (o.all === true) return 'all'
  return Object.values(o).map((x) => valueWords(x, name)).join(' · ')
}

export interface SetupRow { part: string; title: string; kind: SetupPart['kind']; state: SetupPart['state']; detail: string | null; canApply: boolean }
const ORDER: Record<SetupPart['state'], number> = { add: 0, differs: 1, blocked: 2, same: 3 }
const TITLE: Record<SetupPart['kind'], string> = { pack: 'Pack', setting: 'Setting', place: 'Place', service: 'Service', preset: 'Preset', screens: 'Screens' }

/** what one part says beside its name */
function detailOf(p: SetupPart, name: (k: string) => string): string | null {
  if (p.state === 'blocked') return 'its pack is off for the clinic: turn it on under Packs'
  if (p.state === 'add') return p.kind === 'setting' || p.kind === 'screens' ? valueWords(p.want, name) : p.kind === 'preset' ? `/${p.key}` : null
  if (p.state === 'same') return null
  const have = (p.have ?? {}) as { name?: string; retired?: boolean; removed?: boolean }
  if (p.kind === 'pack') return 'unticked here; not ticked again'
  if (p.kind === 'place') return have.removed ? 'removed here; not added again' : have.retired ? 'retired here; kept so' : `here "${have.name ?? '?'}"; kept as it is`
  if (p.kind === 'service' || p.kind === 'preset') return p.have ? 'changed here; kept as it is' : 'removed here; not added again'
  return `here ${valueWords(p.have, name)}; the setup ${valueWords(p.want, name)}`
}

/** the rows to draw: what to add first, then what differs, what waits, and what is the same (folded by the screen) */
export function rows(parts: SetupPart[], name?: (k: string) => string): SetupRow[] {
  return parts.map((p, i): [SetupRow, number] => [{ part: p.part, title: p.kind === 'place' || p.kind === 'service' ? p.name : `${TITLE[p.kind]} · ${partName(p)}`, kind: p.kind,
    state: p.state, detail: detailOf(p, name ?? ((k) => k)), canApply: p.state === 'add' }, i])
    .sort((a, b) => ORDER[a[0].state] - ORDER[b[0].state] || a[1] - b[1]).map(([r]) => r)
}

/** the parts Apply all takes: every part to add, none that differs */
export const missing = (parts: SetupPart[]) => parts.filter((p) => p.state === 'add').map((p) => p.part)

/** which setup a department compares with: the one it was made from while that is still of its work, else the one picked, else the
 *  only one of its work; the chips to pick from show unless the recorded one stands alone */
export function compareChoice(setups: SetupInfo[], dept: { work: string; setup?: string | null }, chosen: string | null) {
  const choices = setups.filter((s) => s.work === dept.work)
  const recorded = choices.some((s) => s.key === dept.setup) ? dept.setup! : null
  return { choices, key: chosen ?? recorded ?? (choices.length === 1 ? choices[0].key : null), pick: !recorded || choices.length > 1 }
}
