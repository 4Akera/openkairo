// /vax (spec/openCare.md §5.8, picture #vax-chart): "/vax mmr 1, opv 5" — each dose its series and number; after it, as needed, "lot
// 4K21M07", "exp 03/2027", a site (r arm, l thigh…), "card 2025-11-09" (copied from the mother's card, with its date) or "not fever
// 39 °C" (not given, and why). Each dose is a draft of the pack's type, whose data is the base's given plus the pack's words. Pure.
import type { Parsed, Result } from '@core/screens/visit/parse'
import { DOSE_TYPE } from './schedule'

/** the series the line knows: its key in the schedule, its name, its CVX code, how it is usually given */
export interface Series { key: string; name: string; cvx?: string; route?: string; site?: string; how?: string; aliases: string[] }
export const SERIES: Series[] = [
  { key: 'hepb', name: 'Hepatitis B', cvx: '08', route: 'im', site: 'right thigh', aliases: ['hepb', 'hbv', 'hb', 'hepatitis b'] },
  { key: 'opv', name: 'OPV', cvx: '02', route: 'oral', how: '2 drops by mouth', aliases: ['opv', 'polio'] },
  { key: 'bcg', name: 'BCG', cvx: '19', route: 'id', site: 'left upper arm', aliases: ['bcg'] },
  { key: 'penta', name: 'Penta', cvx: '102', route: 'im', site: 'right thigh', aliases: ['penta', 'pentavalent'] },
  { key: 'ipv', name: 'IPV', cvx: '10', route: 'im', site: 'left thigh', aliases: ['ipv'] },
  { key: 'vita', name: 'Vitamin A', route: 'oral', how: 'by mouth', aliases: ['vita', 'vit a', 'vitamin a'] },
  { key: 'mmr', name: 'MMR', cvx: '03', route: 'sc', site: 'right arm', how: 'under the skin', aliases: ['mmr'] },
  { key: 'dtp', name: 'DTP', cvx: '01', route: 'im', site: 'left thigh', aliases: ['dtp', 'dpt'] },
  { key: 'pcv', name: 'Pneumococcal', cvx: '133', route: 'im', site: 'left thigh', aliases: ['pcv', 'pcv13', 'pneumo', 'pneumococcal', 'prevenar'] },
  { key: 'rota', name: 'Rotavirus', cvx: '119', route: 'oral', how: 'by mouth', aliases: ['rota', 'rotavirus', 'rotarix'] },
  { key: 'var', name: 'Varicella', cvx: '21', route: 'sc', site: 'left arm', how: 'under the skin', aliases: ['var', 'varicella', 'chickenpox'] },
  { key: 'hepa', name: 'Hepatitis A', cvx: '83', route: 'im', site: 'left thigh', aliases: ['hepa', 'hav', 'hepatitis a'] },
  { key: 'flu', name: 'Influenza', cvx: '150', route: 'im', aliases: ['flu', 'influenza'] },
  { key: 'tt', name: 'Tetanus', cvx: '35', route: 'im', site: 'left arm', aliases: ['tt', 'tetanus', 'td'] },
  { key: 'mening', name: 'Meningococcal', cvx: '114', route: 'im', aliases: ['mening', 'meningococcal', 'mcv4'] },
]
export const seriesOf = (key: string) => SERIES.find((s) => s.key === key)
const findSeries = (w: string) => { const s = w.toLowerCase().trim(); return SERIES.find((x) => x.aliases.includes(s)) }

const SITES: Record<string, string> = { 'r arm': 'right arm', 'l arm': 'left arm', 'r thigh': 'right thigh', 'l thigh': 'left thigh', 'right arm': 'right arm', 'left arm': 'left arm',
  'right thigh': 'right thigh', 'left thigh': 'left thigh', 'rt arm': 'right arm', 'lt arm': 'left arm', 'rt thigh': 'right thigh', 'lt thigh': 'left thigh' }
export const SITE_CHOICES = ['right arm', 'left arm', 'right thigh', 'left thigh']
export const ROUTE_WORDS: Record<string, string> = { im: 'into the muscle', sc: 'under the skin', id: 'into the skin', oral: 'by mouth' }

/** a dose's data: the base's given (the vaccine as its drug, with its CVX code; route, site, lot, expiry; given or not and why) and the pack's words */
export interface DoseData { status: 'completed' | 'not-done'; drug: { text: string; codings: { system: string; code: string; display: string }[] }; route?: string; site?: string
  lot?: string; expiry?: string; reason?: string; vaccines: { vaccine: string; dose?: number; source: 'here' | 'card'; given_on?: string; given_by?: string } }
/** a dose's draft for the composer, as the line or a chip says it */
export function doseDraft(series: Series, dose: number | null, more: Partial<Omit<DoseData, 'vaccines' | 'drug'>> & { source?: 'here' | 'card'; given_on?: string; given_by?: string } = {}): Parsed {
  const { source = 'here', given_on, given_by, ...rest } = more
  const data: DoseData = { status: 'completed', drug: { text: series.name, codings: series.cvx ? [{ system: 'vaccines.cvx', code: series.cvx, display: series.name }] : [] },
    ...(series.route ? { route: series.route } : {}), ...(series.site && source === 'here' && rest.status !== 'not-done' ? { site: series.site } : {}), ...rest,
    vaccines: { vaccine: series.key, ...(dose != null ? { dose } : {}), source, ...(given_on ? { given_on } : {}), ...(given_by ? { given_by } : {}) } }
  return { function: DOSE_TYPE, kind: 'vaccine', params: data as unknown as Record<string, unknown>, line: doseLine(data) }
}
const short = (exp: string) => exp.replace(/^(\d{2})\/(\d{2})(\d{2})$/, '$1/$3')
/** the draft's line: "Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/27 · right arm, under the skin" */
export function doseLine(d: DoseData): string {
  const v = d.vaccines; const how = [d.site, d.route ? ROUTE_WORDS[d.route] ?? d.route : null].filter(Boolean).join(', ')
  if (d.status === 'not-done') return `Not given · ${d.drug.text}${v.dose != null ? ` dose ${v.dose}` : ''}${d.reason ? ` · ${d.reason}` : ''}`
  return [`Vaccine · ${d.drug.text}${v.dose != null ? ` dose ${v.dose}` : ''}`, d.lot && `lot ${d.lot}`, d.expiry && `exp ${short(d.expiry)}`, how || null,
    v.source === 'card' ? `from the card${v.given_on ? ` · ${v.given_on}` : ''}` : null, v.given_by].filter(Boolean).join(' · ')
}

/** "/vax mmr 1, opv 5 lot B2219" → one draft a dose */
export function parseVax(rest: string): Result {
  if (!rest.trim()) return null
  const out: Parsed[] = []
  for (const seg of rest.split(',').map((s) => s.trim()).filter(Boolean)) {
    let s = seg
    const not = s.match(/\s+(?:not|no|not given)\s*[:-]?\s*(.*)$/i); if (not) s = s.slice(0, not.index)
    const card = s.match(/\s+card(?:\s+(\d{4}-\d{2}-\d{2}))?/i); if (card) s = s.replace(card[0], ' ')
    const lot = s.match(/\s+lot\s+(\S+)/i); if (lot) s = s.replace(lot[0], ' ')
    const exp = s.match(/\s+exp(?:iry)?\s+(\d{1,2}\/\d{2,4})/i); if (exp) s = s.replace(exp[0], ' ')
    const site = Object.keys(SITES).find((k) => new RegExp(`\\s${k}\\b`, 'i').test(` ${s}`)); if (site) s = s.replace(new RegExp(site, 'i'), ' ')
    const words = s.trim().split(/\s+/)
    const num = words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1]) ? Number(words.pop()) : null
    const series = findSeries(words.join(' '))
    if (!series) return { error: `Not a vaccine: “${words.join(' ')}”. Try mmr, opv, penta, ipv, bcg, hepb, vita, dtp, pcv, rota, var, hepa, flu, tt` }
    const d = doseDraft(series, num, { source: card ? 'card' : 'here', ...(card?.[1] ? { given_on: card[1] } : {}), ...(lot ? { lot: lot[1] } : {}),
      ...(exp ? { expiry: exp[1].length === 5 ? exp[1].replace(/\/(\d{2})$/, '/20$1') : exp[1] } : {}), ...(site ? { site: SITES[site] } : {}),
      ...(not ? { status: 'not-done' as const, reason: not[1].trim() || 'not given' } : {}) })
    out.push(d)
  }
  return out.length ? { ok: out } : null
}
