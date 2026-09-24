import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...i: ClassValue[]) => twMerge(clsx(i))
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' }
export function Button({ className, variant = 'primary', size = 'md', ...rest }: BtnProps) {
  return <button className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-teal-800 text-white shadow-sm shadow-teal-900/20 hover:bg-teal-900', variant === 'outline' && 'border border-neutral-300 bg-white text-neutral-800 shadow-xs hover:border-neutral-400 hover:bg-neutral-50',
    variant === 'ghost' && 'text-neutral-700 hover:bg-neutral-100', variant === 'danger' && 'bg-red-700 text-white hover:bg-red-800', className)} {...rest} />
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 disabled:bg-neutral-100', className)} {...rest} />
})
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-neutral-500" role="status"><span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-teal-700" />{label}</div>
}
export function Centered({ children }: { children: ReactNode }) { return <div className="grid min-h-[60vh] place-items-center">{children}</div> }
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-neutral-600">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-700">{error}</span>}</label>
}
export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20', className)} {...rest} />
}
export const flagClass = (f: string | null | undefined) => f === 'critical' ? 'text-red-700 font-semibold' : f === 'low' || f === 'high' || f === 'abnormal' ? 'text-amber-700' : 'text-neutral-500'
export const minutesSince = (iso: string | null) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0

/** A panel: the one container every screen uses. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-neutral-200/80 bg-white shadow-xs', className)} {...rest}>{children}</div>
}
/** A small uppercase heading with an optional count and actions on the right. */
export function Heading({ children, count, right, className, tone = 'muted' }: { children: ReactNode; count?: number | string; right?: ReactNode; className?: string; tone?: 'muted' | 'brand' | 'alert' }) {
  return <div className={cn('flex items-center gap-2', className)}>
    <h3 className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', tone === 'muted' && 'text-neutral-500', tone === 'brand' && 'text-teal-800', tone === 'alert' && 'text-red-700')}>{children}</h3>
    {count !== undefined && <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-medium text-neutral-500 tnum">{count}</span>}
    {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
  </div>
}
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'amber' | 'red' | 'blue'; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-px text-[10.5px] font-medium ring-1 ring-inset', {
    neutral: 'bg-neutral-50 text-neutral-600 ring-neutral-200', brand: 'bg-teal-50 text-teal-800 ring-teal-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200', blue: 'bg-sky-50 text-sky-800 ring-sky-200' }[tone], className)}>{children}</span>
}
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/20 px-1 font-sans text-[10px] font-medium opacity-70', className)}>{children}</kbd>
}
/** A square icon button for list rows. */
export function IconButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-teal-700', className)} {...rest} />
}
export const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)

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
