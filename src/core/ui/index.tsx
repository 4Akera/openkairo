import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...i: ClassValue[]) => twMerge(clsx(i))
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' }
export function Button({ className, variant = 'primary', size = 'md', ...rest }: BtnProps) {
  return <button className={cn('inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-teal-800 text-white hover:bg-teal-900', variant === 'outline' && 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50',
    variant === 'ghost' && 'text-neutral-700 hover:bg-neutral-100', variant === 'danger' && 'bg-red-700 text-white hover:bg-red-800', className)} {...rest} />
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 disabled:bg-neutral-100', className)} {...rest} />
})
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-neutral-500" role="status"><span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-teal-700" />{label}</div>
}
export function Centered({ children }: { children: ReactNode }) { return <div className="grid min-h-[60vh] place-items-center">{children}</div> }
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-neutral-600">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-700">{error}</span>}</label>
}
export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm', className)} {...rest} />
}
export const flagClass = (f: string | null | undefined) => f === 'critical' ? 'text-red-700 font-semibold' : f === 'low' || f === 'high' || f === 'abnormal' ? 'text-amber-700' : 'text-neutral-500'
export const minutesSince = (iso: string | null) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0
