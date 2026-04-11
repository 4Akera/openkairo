import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  format, parseISO, differenceInYears, differenceInMonths, differenceInDays,
  isValid, sub,
} from 'date-fns'
import type { DatePrecision, NameFormat } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string respecting its stored precision.
 * - 'year'  → "2018"
 * - 'month' → "May 2018"
 * - 'full'  → "May 3, 2018"
 */
export function formatDateWithPrecision(
  date: string | null | undefined,
  precision: DatePrecision | null | undefined = 'full',
): string {
  if (date == null || String(date).trim() === '') return '—'
  try {
    const normalized = String(date).split('T')[0]
    const parsed = parseISO(normalized)
    if (!isValid(parsed)) return '—'
    if (precision === 'year')  return format(parsed, 'yyyy')
    if (precision === 'month') return format(parsed, 'MMM yyyy')
    return format(parsed, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

/**
 * Build the ISO date string to store in the DB from year/month/day parts.
 * Missing month defaults to '01', missing day defaults to '01'.
 */
export function buildIsoDate(year: string, month?: string, day?: string): string {
  const m = month && month !== '' ? month.padStart(2, '0') : '01'
  const d = day && day !== '' ? day.padStart(2, '0') : '01'
  return `${year}-${m}-${d}`
}

export function formatDate(date: string | null | undefined, fmt = 'MMM d, yyyy'): string {
  if (date == null || String(date).trim() === '') return '—'
  try {
    const normalized = String(date).split('T')[0]
    const parsed = parseISO(normalized)
    if (!isValid(parsed)) return '—'
    return format(parsed, fmt)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | null | undefined): string {
  if (date == null || String(date).trim() === '') return '—'
  try {
    const parsed = parseISO(String(date))
    if (!isValid(parsed)) return '—'
    return format(parsed, 'MMM d, yyyy · h:mm a')
  } catch {
    return '—'
  }
}

/** Prefer `patients.date_of_birth`, fall back to `custom_fields.date_of_birth` (YYYY-MM-DD). */
export function getPatientDob(pat: {
  date_of_birth: string | null
  custom_fields?: Record<string, unknown>
}): string | null {
  const raw = pat.date_of_birth ?? pat.custom_fields?.['date_of_birth']
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  return s.split('T')[0].slice(0, 10)
}

/** Prefer column `gender`, then `custom_fields.gender`. */
export function getPatientGender(pat: {
  gender: string | null
  custom_fields?: Record<string, unknown>
}): string | null {
  const col = pat.gender?.trim()
  if (col) return col
  const cf = pat.custom_fields?.['gender']
  if (cf == null) return null
  const s = String(cf).trim()
  return s || null
}

/** Whole years from DOB; `null` if missing or invalid (never returns a sentinel string). */
export function calcAgeYears(dob: string | null | undefined): number | null {
  if (dob == null || String(dob).trim() === '') return null
  try {
    const normalized = String(dob).split('T')[0].slice(0, 10)
    const parsed = parseISO(normalized)
    if (!isValid(parsed)) return null
    const years = differenceInYears(new Date(), parsed)
    if (years < 0 || years > 130) return null
    return years
  } catch {
    return null
  }
}

/**
 * Short age string for table/list display.
 * Returns "45y" | "8mo" | "12d" or "" when unknown.
 */
export function calcAge(dob: string | null | undefined): string {
  if (dob == null || String(dob).trim() === '') return ''
  try {
    const normalized = String(dob).split('T')[0].slice(0, 10)
    const parsed = parseISO(normalized)
    if (!isValid(parsed)) return ''
    const now = new Date()
    const years = differenceInYears(now, parsed)
    if (years >= 1) return `${years}y`
    const months = differenceInMonths(now, parsed)
    if (months >= 1) return `${months}mo`
    const days = differenceInDays(now, parsed)
    return days >= 0 ? `${days}d` : ''
  } catch {
    return ''
  }
}

/**
 * Human-friendly age for display banners.
 * Returns "28 y/o" | "5 mo" | "3 d" | null when unknown.
 */
export function calcAgeVerbose(dob: string | null | undefined): string | null {
  if (dob == null || String(dob).trim() === '') return null
  try {
    const normalized = String(dob).split('T')[0].slice(0, 10)
    const parsed = parseISO(normalized)
    if (!isValid(parsed)) return null
    const now = new Date()
    const years = differenceInYears(now, parsed)
    if (years >= 1) return `${years} y/o`
    const months = differenceInMonths(now, parsed)
    if (months >= 1) return `${months} mo`
    const days = differenceInDays(now, parsed)
    if (days >= 0) return `${days} d`
    return null
  } catch {
    return null
  }
}

/**
 * Convert an entered age (years/months/days) to an approximate ISO date + precision.
 * Used in "Enter age" mode when creating a new patient.
 */
export function ageToApproxDob(
  value: number,
  unit: 'years' | 'months' | 'days',
): { iso: string; precision: DatePrecision } {
  const dob = sub(new Date(), {
    years:  unit === 'years'  ? value : 0,
    months: unit === 'months' ? value : 0,
    days:   unit === 'days'   ? value : 0,
  })
  const iso = format(dob, 'yyyy-MM-dd')
  const precision: DatePrecision =
    unit === 'years' ? 'year' : unit === 'months' ? 'month' : 'full'
  return { iso, precision }
}

export function fullName(
  p: { first_name: string; middle_name?: string | null; last_name: string },
  format: NameFormat = 'two',
): string {
  if (format === 'three' && p.middle_name?.trim()) {
    return `${p.first_name} ${p.middle_name} ${p.last_name}`
  }
  return `${p.first_name} ${p.last_name}`
}

export function generateMRN(): string {
  return `MRN-${Date.now().toString(36).toUpperCase()}`
}

// Legacy map kept for BUILTIN_METADATA fallback in BlockWrapper
export const BLOCK_LABELS: Record<string, string> = {
  hx_physical: 'History & Physical',
  note:        'Note',
  med_orders:  'Medications',
  plan:        'Assessment & Plan',
  vitals:      'Vitals',
}

// ============================================================
// Definition-aware color + icon system
// ============================================================

export interface DefinitionColors {
  border: string    // border-l-* class
  iconBg: string    // bg-* class
  badge: string     // badge bg + text classes
}

export const DEFINITION_COLORS: Record<string, DefinitionColors> = {
  blue:    { border: 'border-l-blue-500',    iconBg: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-800' },
  purple:  { border: 'border-l-purple-500',  iconBg: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-800' },
  violet:  { border: 'border-l-violet-500',  iconBg: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-800' },
  indigo:  { border: 'border-l-indigo-500',  iconBg: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-800' },
  green:   { border: 'border-l-emerald-500', iconBg: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  emerald: { border: 'border-l-emerald-600', iconBg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-900' },
  teal:    { border: 'border-l-teal-500',    iconBg: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-800' },
  cyan:    { border: 'border-l-cyan-500',    iconBg: 'bg-cyan-500',    badge: 'bg-cyan-100 text-cyan-800' },
  sky:     { border: 'border-l-sky-500',     iconBg: 'bg-sky-500',     badge: 'bg-sky-100 text-sky-800' },
  lime:    { border: 'border-l-lime-500',    iconBg: 'bg-lime-500',    badge: 'bg-lime-100 text-lime-800' },
  amber:   { border: 'border-l-amber-500',   iconBg: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-800' },
  orange:  { border: 'border-l-orange-500',  iconBg: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-800' },
  red:     { border: 'border-l-red-500',     iconBg: 'bg-red-500',     badge: 'bg-red-100 text-red-800' },
  rose:    { border: 'border-l-rose-500',    iconBg: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-800' },
  pink:    { border: 'border-l-pink-500',    iconBg: 'bg-pink-500',    badge: 'bg-pink-100 text-pink-800' },
  fuchsia: { border: 'border-l-fuchsia-500', iconBg: 'bg-fuchsia-500', badge: 'bg-fuchsia-100 text-fuchsia-800' },
  slate:   { border: 'border-l-slate-400',   iconBg: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700' },
}

export function getDefinitionColors(color: string): DefinitionColors {
  return DEFINITION_COLORS[color] ?? DEFINITION_COLORS.slate
}

export function getBlockPreview(
  block: { type: string; content: Record<string, unknown> },
  /** When set (e.g. from `registry_slug`), preview uses this registry key instead of `block.type`. */
  renderType?: string | null,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = block.content as Record<string, any>
  const t = (renderType?.trim() || block.type)
  switch (t) {
    case 'hx_physical':
      return (c.chief_complaint as string)?.trim()
        ? `CC: ${(c.chief_complaint as string).trim().slice(0, 90)}`
        : (c.hpi as string)?.trim().slice(0, 90) || ''
    case 'note':
      return (c.body as string)?.trim().slice(0, 120) || ''
    case 'med_orders':
    case 'meds': {
      const items = (c.items as Array<{ name: string }> | undefined) ?? []
      if (items.length === 0) return ''
      const names = items.slice(0, 4).map(i => i.name).filter(Boolean)
      const suffix = items.length > 4 ? ` +${items.length - 4} more` : ''
      return names.join(', ') + suffix
    }
    case 'plan': {
      const assessment = (c.assessment as string | undefined)?.trim()
      if (assessment) return assessment.slice(0, 120)
      const problems = (c.problems as Array<{ problem: string }> | undefined) ?? []
      return problems.map(p => p.problem).filter(Boolean).slice(0, 3).join('; ')
    }
    case 'vitals': {
      const parts: string[] = []
      if (!((c.bp_flags as string[] | undefined)?.includes('unmeasured')) && c.bp_systolic && c.bp_diastolic)
        parts.push(`BP ${c.bp_systolic}/${c.bp_diastolic}`)
      if (!((c.pr_flags as string[] | undefined)?.includes('unmeasured')) && c.pulse_rate)
        parts.push(`PR ${c.pulse_rate}`)
      if (!((c.spo2_flags as string[] | undefined)?.includes('unmeasured')) && c.spo2)
        parts.push(`SpO₂ ${c.spo2}%`)
      if (!((c.temp_flags as string[] | undefined)?.includes('unmeasured')) && c.temperature)
        parts.push(`T ${c.temperature}°${(c.temp_unit as string) ?? 'C'}`)
      return parts.join(' · ')
    }
    default:
      return ''
  }
}


