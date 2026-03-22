/**
 * ClinicalDatePicker
 *
 * Three cascading selects: Year → Month (optional) → Day (optional).
 * Precision is derived from how many fields are filled:
 *   Year only         → precision = 'year'
 *   Year + Month      → precision = 'month'
 *   Year + Month + Day → precision = 'full'
 *
 * Props:
 *   value      – ISO date string ("YYYY-MM-DD") or null
 *   precision  – 'year' | 'month' | 'full' or null
 *   onChange   – called with (isoDate: string | null, precision: DatePrecision | null)
 *   placeholder – optional label when empty (default: "Select date")
 *   minYear / maxYear – year range (defaults 1900 – current year + 1)
 */

import { useEffect, useState } from 'react'
import { parseISO, isValid, getDaysInMonth } from 'date-fns'
import type { DatePrecision } from '@/types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  value: string | null | undefined
  precision?: DatePrecision | null
  onChange: (isoDate: string | null, precision: DatePrecision | null) => void
  placeholder?: string
  minYear?: number
  maxYear?: number
}

function padTwo(n: number) {
  return String(n).padStart(2, '0')
}

export function ClinicalDatePicker({
  value,
  precision,
  onChange,
  placeholder = 'Select date',
  minYear,
  maxYear,
}: Props) {
  const thisYear = new Date().getFullYear()
  const min = minYear ?? 1900
  const max = maxYear ?? thisYear + 1

  // Internal state: string parts ('' = empty/unset)
  const [year, setYear]   = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [day, setDay]     = useState<string>('')

  // Seed from incoming value + precision
  useEffect(() => {
    if (value == null || String(value).trim() === '') {
      setYear(''); setMonth(''); setDay(''); return
    }
    const parsed = parseISO(String(value).split('T')[0])
    if (!isValid(parsed)) { setYear(''); setMonth(''); setDay(''); return }

    const y = String(parsed.getFullYear())
    const m = padTwo(parsed.getMonth() + 1)
    const d = padTwo(parsed.getDate())

    setYear(y)
    if (precision === 'year')  { setMonth(''); setDay(''); return }
    setMonth(m)
    if (precision === 'month') { setDay(''); return }
    setDay(d)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, precision])

  // Emit whenever internal state changes
  const emit = (y: string, m: string, d: string) => {
    if (!y) { onChange(null, null); return }
    const mm = m ? m.padStart(2, '0') : '01'
    const dd = d ? d.padStart(2, '0') : '01'
    const iso = `${y}-${mm}-${dd}`
    const prec: DatePrecision = !m ? 'year' : !d ? 'month' : 'full'
    onChange(iso, prec)
  }

  const handleYear = (v: string) => {
    setYear(v)
    if (!v) { setMonth(''); setDay('') }
    emit(v, month, day)
  }

  const handleMonth = (v: string) => {
    // When month cleared, also clear day
    if (!v) { setMonth(''); setDay(''); emit(year, '', ''); return }
    // Clamp day to valid range
    let clamped = day
    if (day && year) {
      const days = getDaysInMonth(new Date(Number(year), Number(v) - 1))
      if (Number(day) > days) clamped = ''
    }
    setMonth(v)
    setDay(clamped)
    emit(year, v, clamped)
  }

  const handleDay = (v: string) => {
    setDay(v)
    emit(year, month, v)
  }

  // Build day options for selected year+month
  const daysInMonth =
    year && month
      ? getDaysInMonth(new Date(Number(year), Number(month) - 1))
      : 31

  const years = Array.from({ length: max - min + 1 }, (_, i) => max - i) // descending

  const selectCls =
    'rounded-md border border-input bg-background px-2 py-1.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed ' +
    'disabled:opacity-50'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Year */}
      <select
        value={year}
        onChange={e => handleYear(e.target.value)}
        className={`${selectCls} w-24`}
        aria-label="Year"
      >
        <option value="">Year</option>
        {years.map(y => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>

      {/* Month — only show when year is chosen */}
      {year && (
        <select
          value={month}
          onChange={e => handleMonth(e.target.value)}
          className={`${selectCls} w-32`}
          aria-label="Month"
        >
          <option value="">Month (optional)</option>
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={padTwo(i + 1)}>{name}</option>
          ))}
        </select>
      )}

      {/* Day — only show when month is chosen */}
      {year && month && (
        <select
          value={day}
          onChange={e => handleDay(e.target.value)}
          className={`${selectCls} w-28`}
          aria-label="Day"
        >
          <option value="">Day (optional)</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
            <option key={d} value={padTwo(d)}>{d}</option>
          ))}
        </select>
      )}

      {/* Precision badge */}
      {year && (
        <span className="text-xs text-muted-foreground">
          {!month ? 'year only' : !day ? 'year & month' : 'full date'}
        </span>
      )}

      {!year && (
        <span className="text-xs text-muted-foreground">{placeholder}</span>
      )}
    </div>
  )
}
