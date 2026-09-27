// The frame every /design page draws in: one column in the app's theme, or light and dark side by side. Each side carries its
// own data-theme and the utilities read the tokens inline (styles.css §2), so both themes show at once whatever the app's is.
import { useState, type ReactNode } from 'react'
import { Card, Heading, cn } from '../../ui'
import { ColumnContext } from './live'

export function Columns({ side, children }: { side: boolean; children: ReactNode }) {
  if (!side) return <Column theme={null}>{children}</Column>
  return <div className="grid gap-4 xl:grid-cols-2">{(['light', 'dark'] as const).map((t) => <Column key={t} theme={t}>{children}</Column>)}</div>
}
function Column({ theme, children }: { theme: 'light' | 'dark' | null; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  return <div ref={setRoot} data-theme={theme ?? undefined} className={cn('min-w-0', theme && 'rounded-xl bg-canvas p-3 text-fg ring-1 ring-line sm:p-4')}>
    {theme && <p className="mb-3 text-11 font-semibold uppercase tracking-[0.08em] text-faint">{theme === 'light' ? 'Light' : 'Dark'}</p>}
    <ColumnContext.Provider value={{ theme, root }}>{children}</ColumnContext.Provider>
  </div>
}

/** a group of samples on a card, under an overline */
export function Group({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <section className="grid min-w-0 gap-2">
    <Heading>{title}</Heading>{hint && <p className="-mt-1 text-12 text-faint">{hint}</p>}
    <Card className={cn('grid min-w-0 gap-5 p-4', className)}>{children}</Card>
  </section>
}

/** one labelled sample: what it is, what it shows, and the thing itself */
export function Sample({ title, note, children, className }: { title: ReactNode; note?: ReactNode; children: ReactNode; className?: string }) {
  return <div className="grid min-w-0 gap-2">
    <p className="flex flex-wrap items-baseline gap-x-2 text-12"><span className="font-medium text-fg">{title}</span>{note && <span className="text-faint">{note}</span>}</p>
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>{children}</div>
  </div>
}
