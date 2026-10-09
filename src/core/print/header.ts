// The clinic's header on every printout (spec/openCare.md §3.13 Printing, (p3)): its name, logo, address, phone and tax number, the
// core's setting organization.header, edited in Settings → Organization. Until it is set, the organization's own name. Pure.
import type { Organization } from '../db/types'

export interface ClinicHeader { name: string; logo: string | null; address: string | null; phone: string | null; tax_number: string | null }
export const HEADER_KEY = 'organization.header'
/** the largest logo the setting keeps (a data: URI, as its shape says): a small picture, sent with every directory read */
export const LOGO_MAX = 100_000
/** the logo kinds a header takes */
export const LOGO_KINDS = ['image/png', 'image/jpeg', 'image/webp']

const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
/** the header as the setting stands (its latest row), else the organization's name */
export function headerOf(org: Pick<Organization, 'organization' | 'settings'> | undefined): ClinicHeader {
  const row = (org?.settings ?? []).filter((s) => s.key === HEADER_KEY).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  const d = (row?.data ?? {}) as Record<string, unknown>
  return { name: text(d.name) ?? org?.organization.name ?? '', logo: text(d.logo), address: text(d.address), phone: text(d.phone), tax_number: text(d.tax_number) }
}
/** the header's lines under the name: the address, then the phone and the tax number on one line */
export function headerLines(h: ClinicHeader): string[] {
  return [h.address, [h.phone && `Tel. ${h.phone}`, h.tax_number && `Tax no. ${h.tax_number}`].filter(Boolean).join(' · ')].filter((x): x is string => !!x)
}
/** a picture as the setting keeps it: a data: URI of a known kind, no larger than the setting takes */
export const logoOk = (uri: string) => uri.length <= LOGO_MAX && new RegExp(`^data:(${LOGO_KINDS.join('|').replace(/\//g, '\\/')});base64,[A-Za-z0-9+/]+=*$`).test(uri)
