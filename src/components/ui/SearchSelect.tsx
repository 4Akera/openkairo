/**
 * SearchSelect — THE dropdown for long lists (physicians, service items):
 * a search bar over a scrollable list, never a bare <select>. Panel is
 * fixed-position (same idiom as the encounter header's physician picker)
 * so it works inside dialogs and scrolling containers alike.
 */
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/utils'

export type SearchSelectItem = {
  value: string
  label: string
  /** Right-aligned secondary text, e.g. a price or code. Also searched. */
  hint?: string
}

const PANEL_MIN_WIDTH = 264
const PANEL_MAX_HEIGHT = 260
const VISIBLE_LIMIT = 50

/**
 * position:fixed resolves against the nearest transformed ancestor rather
 * than the viewport (e.g. a dialog's translate(-50%,-50%) centering), so
 * viewport coordinates must be shifted by that ancestor's box. The panel
 * stays inline in the DOM — a portal would escape the dialog's focus trap,
 * which would yank focus straight back out of the search input.
 */
function fixedPositionOffset(el: HTMLElement): { left: number; top: number; bottom: number } {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (
      s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none'
      || (s.backdropFilter || 'none') !== 'none'
      || /transform|perspective|filter/.test(s.willChange)
    ) {
      const r = n.getBoundingClientRect()
      return { left: r.left, top: r.top, bottom: r.bottom }
    }
  }
  return { left: 0, top: 0, bottom: window.innerHeight }
}

export function SearchSelect({
  items,
  value,
  onSelect,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  clearLabel,
  disabled,
  className,
}: {
  items: SearchSelectItem[]
  value?: string | null
  onSelect: (value: string) => void
  /** Trigger content when nothing is selected. */
  placeholder?: ReactNode
  searchPlaceholder?: string
  /** When set, a leading row that selects '' (clears the choice). */
  clearLabel?: string
  disabled?: boolean
  /** Extra classes for the trigger button. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const [backdropStyle, setBackdropStyle] = useState<CSSProperties | undefined>(undefined)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selected = value ? items.find(i => i.value === value) ?? null : null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(i =>
      i.label.toLowerCase().includes(needle) || (i.hint ?? '').toLowerCase().includes(needle))
  }, [items, q])

  const openPanel = () => {
    const trigger = triggerRef.current
    const rect = trigger?.getBoundingClientRect()
    if (!trigger || !rect) return
    const width = Math.max(rect.width, PANEL_MIN_WIDTH)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < PANEL_MAX_HEIGHT + 12 && rect.top > spaceBelow
    const off = fixedPositionOffset(trigger)
    setPanelStyle(openUp
      ? { bottom: off.bottom - (rect.top - 4), left: left - off.left, width }
      : { top: rect.bottom + 4 - off.top, left: left - off.left, width })
    setBackdropStyle({ left: -off.left, top: -off.top, width: '100vw', height: '100vh' })
    setQ('')
    setOpen(true)
  }

  const pick = (v: string) => {
    setOpen(false)
    onSelect(v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('flex-1 min-w-0 truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>

      {open && panelStyle && (
        <>
          <div className="fixed z-[90]" style={backdropStyle} onClick={() => setOpen(false)} />
          <div
            className="fixed z-[100] rounded-lg border border-border bg-card shadow-xl overflow-hidden"
            style={panelStyle}
            onKeyDown={e => {
              // stopPropagation keeps Escape from also closing a parent dialog
              if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
            }}
          >
            <div className="relative flex items-center border-b border-border">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filtered.length > 0) {
                    e.preventDefault()
                    pick(filtered[0].value)
                  }
                }}
                className="w-full text-xs bg-transparent pl-8 pr-2.5 py-2 text-foreground focus:outline-none"
              />
            </div>
            <div className="max-h-52 overflow-y-auto overscroll-contain">
              {clearLabel && !q.trim() && (
                <button
                  type="button"
                  onClick={() => pick('')}
                  className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent/60 transition-colors italic"
                >
                  {clearLabel}
                </button>
              )}
              {filtered.slice(0, VISIBLE_LIMIT).map(i => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => pick(i.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/60 transition-colors',
                    i.value === value && 'bg-accent/40',
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{i.label}</span>
                  {i.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{i.hint}</span>}
                  {i.value === value && <Check className="h-3 w-3 text-primary shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  {items.length === 0 ? 'Nothing to pick yet' : 'No matches'}
                </p>
              )}
              {filtered.length > VISIBLE_LIMIT && (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/60">
                  {filtered.length - VISIBLE_LIMIT} more — keep typing to narrow down
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
