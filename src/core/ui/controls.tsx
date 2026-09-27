// The kit's controls (design-system.md §4.2–4.3): buttons, fields, chips, the segmented choice, the switch and the theme choice.
// Tokens only; className comes last through cn, for layout (never colour). An icon inside a button takes the button's size
// unless it names its own ([:where(&)_svg] has no weight, so the icon's h-3 w-3 still wins).
import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import { Check, Monitor, Moon, Search, Sun } from 'lucide-react'
import { cn } from './tone'
import { useTheme, type ThemePref } from './theme'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'danger-ghost'; size?: 'xs' | 'sm' | 'md'; loading?: boolean }
const BTN_SIZE = { xs: 'h-6 px-2 rounded-md text-12 [:where(&)_svg]:size-3.5', sm: 'h-7 px-2.5 rounded-md text-12 [:where(&)_svg]:size-3.5', md: 'h-9 px-3.5 text-14 [:where(&)_svg]:size-4' }
const BTN_VARIANT = {
  primary: 'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
  soft: 'bg-accent-soft text-accent hover:ring-1 hover:ring-inset hover:ring-accent-line',
  outline: 'border border-line-strong bg-surface text-fg shadow-xs hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90',
  'danger-ghost': 'text-muted hover:bg-danger-soft hover:text-danger',
}
const Glyph = () => <span aria-hidden className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none" />
export function Button({ className, variant = 'primary', size = 'md', loading, disabled, children, ...rest }: BtnProps) {
  return <button className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50',
    BTN_SIZE[size], BTN_VARIANT[variant], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{loading && <Glyph />}{children}</button>
}

/** a square icon button for list rows; it needs a title or an aria-label */
export function IconButton({ className, size = 'sm', tone = 'default', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md'; tone?: 'default' | 'danger' }) {
  return <button type="button" className={cn('inline-flex shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg focus-ring disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'size-6 [:where(&)_svg]:size-3.5' : 'size-8 [:where(&)_svg]:size-4', tone === 'danger' && 'hover:bg-danger-soft hover:text-danger', className)} {...rest} />
}

const FIELD = 'w-full rounded-lg border border-line-strong bg-sunken text-fg placeholder:text-faint transition-colors hover:border-faint/50 focus:border-accent focus:bg-surface focus:outline-none focus:ring-3 focus:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20'
const FIELD_TONE = { default: '', warn: 'border-warn bg-warn-soft', danger: 'border-danger bg-danger-soft' }
type Dense = { dense?: boolean; tone?: 'default' | 'warn' | 'danger' }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Dense>(function Input({ className, dense, tone = 'default', ...rest }, ref) {
  return <input ref={ref} className={cn(FIELD, dense ? 'h-7 rounded-md px-2 text-13' : 'h-9 px-3 text-14', FIELD_TONE[tone], className)} {...rest} />
})
export function Select({ className, dense, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { dense?: boolean }) {
  return <select className={cn(FIELD, dense ? 'h-7 rounded-md px-1.5 text-13' : 'h-9 px-2 text-14', className)} {...rest} />
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; minRows?: number; maxRows?: number; dense?: boolean }
/** note text, the long note, reasons; autoGrow follows the text (field-sizing, and by hand where a browser lacks it) */
export const Textarea = forwardRef<HTMLTextAreaElement, AreaProps>(function Textarea({ autoGrow, minRows = 3, maxRows = 20, dense, className, style, value, onInput, ...rest }, ref) {
  const own = useRef<HTMLTextAreaElement | null>(null)
  const setRef = useCallback((el: HTMLTextAreaElement | null) => { own.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el }, [ref])
  const grow = useCallback(() => {
    const el = own.current; if (!el || !autoGrow || CSS.supports?.('field-sizing', 'content')) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`                    // max-height caps it; past that it scrolls
  }, [autoGrow])
  useLayoutEffect(grow, [grow, value])
  return <textarea ref={setRef} rows={minRows} value={value} onInput={(e) => { grow(); onInput?.(e) }}
    style={{ ...(autoGrow ? { maxHeight: `calc(${maxRows} * 1.625em + 1rem + 2px)` } : {}), ...style }}
    className={cn(FIELD, 'block min-h-16 resize-y leading-relaxed', dense ? 'rounded-md px-2 py-1.5 text-13' : 'px-3 py-2 text-14', autoGrow && 'field-sizing-content', className)} {...rest} />
})

const toNum = (v: string, integer?: boolean) => { const t = v.trim(); return !t ? null : (integer ? /^\d+$/ : /^(\d+\.?\d*|\.\d+)$/).test(t) ? Number(t) : undefined }
/** a number field that keeps what is typed ("2." stays "2.", so 2.5 is not 25) and sends the number; what it cannot read is marked */
export function NumberInput({ value, onValue, integer, label, dense, placeholder, className }: { value: number | null | undefined; onValue: (n: number | null) => void; integer?: boolean; label: string; dense?: boolean; placeholder?: string; className?: string }) {
  const [raw, setRaw] = useState(value == null ? '' : String(value)); const n = toNum(raw, integer)
  const shown = n === undefined || n === (value ?? null) ? raw : value == null ? '' : String(value)   // the value changed from outside (a chip): show it
  return <Input aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} value={shown} placeholder={placeholder} dense={dense} onFocus={(e) => e.target.select()}
    aria-invalid={toNum(shown, integer) === undefined || undefined} onChange={(e) => { setRaw(e.target.value); const v = toNum(e.target.value, integer); onValue(v === undefined ? null : v) }} className={cn('text-end tnum', className)} />
}

/** a label over its control, with a line of help or the error; a dot when it differs from what is saved */
export function Field({ label, children, error, hint, changed, className }: { label: ReactNode; children: ReactNode; error?: string; hint?: ReactNode; changed?: boolean; className?: string }) {
  return <label className={cn('grid content-start gap-1', className)}>
    <span className="flex items-center gap-1.5 text-12 font-medium text-muted">{label}{changed && <span className="size-1.5 rounded-full bg-warn" title="Changed, not saved yet" />}</span>
    {children}{hint && <span className="text-12 text-faint">{hint}</span>}{error && <span role="alert" className="text-12 text-danger">{error}</span>}
  </label>
}

/** a filter box; Enter calls onEnter (picks the first match) and never submits a form around it */
export function SearchInput({ value, onChange, placeholder, onEnter, size = 'md', autoFocus, inputRef, className }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void; size?: 'md' | 'lg'; autoFocus?: boolean; inputRef?: Ref<HTMLInputElement>; className?: string }) {
  return <div className={cn('relative', className)}>
    <Search aria-hidden className={cn('pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-faint', size === 'lg' ? 'start-3' : 'start-2.5')} />
    <Input ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder}
      className={size === 'lg' ? 'h-11 ps-9 text-16' : 'ps-8'} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }} />
  </div>
}

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { on?: boolean; onClick: () => void; variant?: 'solid' | 'check'; shape?: 'rounded' | 'pill'; dot?: boolean }
/** one of several (frequencies, reasons, filters): solid for a single choice, check for several; dot marks the usual one */
export function Chip({ on, onClick, children, variant = 'solid', shape = 'rounded', dot, className, ...rest }: ChipProps) {
  return <button type="button" aria-pressed={!!on} onClick={onClick} className={cn('relative inline-flex h-6 shrink-0 items-center gap-1 px-2 text-12 ring-1 ring-inset transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50',
    shape === 'pill' ? 'rounded-full px-2.5' : 'rounded-md',
    !on ? 'bg-surface text-muted ring-line hover:text-fg hover:ring-line-strong' : variant === 'check' ? 'bg-accent-soft font-medium text-accent ring-accent-line' : 'bg-accent text-accent-fg ring-accent', className)} {...rest}>
    {on && variant === 'check' && <Check aria-hidden className="size-3" />}{children}
    {dot && !on && <span aria-hidden className="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-accent" />}
  </button>
}

/** roving focus for a row of choices: ←/→ (and Home/End) move and choose */
function rove<T>(e: KeyboardEvent, list: T[], at: number, go: (v: T) => void) {
  const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null
  if (n === null || !list.length) return
  e.preventDefault(); const i = (n + list.length) % list.length; go(list[i])
  e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[i]?.focus()
}

/** one of a few: a quiet thumb, not a teal fill, so a form full of them stays calm */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', className, 'aria-label': label }: { value: T | null | undefined; options: [T, ReactNode][]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string; 'aria-label'?: string }) {
  const at = options.findIndex(([v]) => v === value)
  return <span role="radiogroup" aria-label={label} onKeyDown={(e) => rove(e, options.map(([v]) => v), at, onChange)}
    className={cn('inline-flex flex-wrap rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line', className)}>{options.map(([v, l], i) =>
    <button type="button" role="radio" aria-checked={value === v} tabIndex={i === Math.max(at, 0) ? 0 : -1} key={v} onClick={() => onChange(v)}
      className={cn('inline-flex items-center gap-1.5 rounded-md text-12 transition-colors duration-base focus-ring [:where(&)_svg]:size-3.5', size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1',
        value === v ? 'bg-surface font-medium text-fg shadow-xs' : 'text-muted hover:text-fg')}>{l}</button>)}</span>
}

/** on or off (a pack in Settings) */
export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className={cn('relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors duration-base aria-checked:bg-accent focus-ring disabled:opacity-50', className)}>
    <span aria-hidden className={cn('absolute start-0.5 top-0.5 size-4 rounded-full bg-paper shadow-sm transition-transform duration-base', checked && 'translate-x-4 rtl:-translate-x-4')} />
  </button>
}

const THEMES: [ThemePref, string, typeof Sun][] = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]
/** the theme choice: segmented (a page), icon (a header, cycles), menu (inside a Menu: a Radix radio group, so the menu's arrow keys still work) */
export function ThemeToggle({ variant = 'segmented' }: { variant?: 'segmented' | 'icon' | 'menu' }) {
  const { pref, setTheme } = useTheme()
  if (variant === 'menu') return <RadixMenu.RadioGroup value={pref} onValueChange={(v) => setTheme(v as ThemePref)}>
    {THEMES.map(([v, l, I]) => <RadixMenu.RadioItem key={v} value={v} onSelect={(e) => e.preventDefault()}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-14 outline-none data-[highlighted]:bg-hover">
      <I aria-hidden className="size-4 text-faint" />{l}<RadixMenu.ItemIndicator className="ms-auto text-accent"><Check className="size-4" /></RadixMenu.ItemIndicator></RadixMenu.RadioItem>)}
  </RadixMenu.RadioGroup>
  if (variant === 'icon') {
    const i = THEMES.findIndex(([v]) => v === pref); const [, label, I] = THEMES[i]; const [nextV, nextL] = THEMES[(i + 1) % THEMES.length]
    return <IconButton size="md" title={`Theme: ${label} (click for ${nextL})`} aria-label={`Theme: ${label}`} onClick={() => setTheme(nextV)}><I /></IconButton>
  }
  return <Segmented aria-label="Theme" value={pref} onChange={setTheme} options={THEMES.map(([v, l, I]) => [v, <><I aria-hidden />{l}</>])} />
}
