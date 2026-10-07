// The / list under the line (owner, 2026-10-07): one column in groups — Record · Orders and medicines · Safety and scores, then each
// pack the department uses — each row the command's name, its /code and one short example; it narrows as the user types; ↑↓ move,
// ↵ chooses, Tab takes the first, Esc closes (the composer's keys). An inline card under the line, never a menu over the record.
import type { Suggestion } from './expand'
import { Kbd, cn } from '../../ui'

export function SlashList({ items, pick, onAccept }: { items: Suggestion[]; pick: number; onAccept: (s: Suggestion) => void }) {
  return <div className="border-b border-line bg-sunken p-1.5">
    <ul className="grid">{items.map((s, i) => {
      const on = pick === i || (pick < 0 && i === 0); const head = s.group && s.group !== items[i - 1]?.group
      return <li key={s.key}>
        {head && <p className={cn('px-2 pb-0.5 text-11 font-semibold uppercase tracking-[0.06em] text-faint', i > 0 ? 'pt-2' : 'pt-1')}>{s.group}</p>}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAccept(s)}
          className={cn('grid w-full grid-cols-[minmax(0,9rem)_4.5rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-md px-2 py-1 text-start transition-colors focus-ring',
            on ? 'bg-surface ring-1 ring-accent-line' : 'hover:bg-hover')}>
          <span className="truncate text-13 text-fg">{s.title ?? s.label}</span>
          <span className="truncate font-mono text-12 text-muted">{s.label}</span>
          <span className={cn('text-12 text-faint', on ? 'break-words' : 'truncate')}>{s.detail}</span>
          {on ? <Kbd className="text-accent">{pick === i ? '↵' : 'tab'}</Kbd> : <span />}
        </button>
      </li>
    })}</ul>
    <p className="flex flex-wrap gap-x-3 px-2 pt-1.5 text-11 text-faint"><span><Kbd>↑↓</Kbd> move</span><span><Kbd>↵</Kbd> choose</span><span><Kbd>tab</Kbd> takes the first</span><span><Kbd>esc</Kbd> close</span></p>
  </div>
}
