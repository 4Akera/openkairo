// /design · Type & space (design-system.md §2.1): the seven sizes as the browser drew them, weights, figures, the spacing steps,
// radii, shadows, motion (the durations read live, so reduced motion shows as 0 ms) and the layers.
import { useState } from 'react'
import { Button, cn } from '../../ui'
import { Columns, Group, Sample } from './Frame'
import { useLive, useMedia } from './live'

const SIZES: [string, string, string][] = [['text-11', '500–600', 'overlines, tags, kbd, table heads, counts'], ['text-12', '400–500', 'meta: times, hints, secondary lines, small buttons, chips'],
  ['text-13', '400–500', 'dense body: list rows, the record, tables, the side panel'], ['text-14', '400–500', 'body, inputs, buttons, notes'],
  ['text-16', '600', "section titles, a result's name, the big search"], ['text-18', '600, tight', "the patient's name, page titles"], ['text-22', '600, tight', 'stat values, page heads']]
const WEIGHTS: [string, string][] = [['font-normal', '400 body'], ['font-medium', '500 labels, names'], ['font-semibold', '600 headings, values'], ['font-bold', '700 a one-letter logo or avatar']]
const SPACE: [string, string, string][] = [['w-1', '1 · 4 px', 'icon to label'], ['w-1.5', '1.5 · 6 px', 'tag padding, chip gaps'], ['w-2', '2 · 8 px', 'inside a row, a label to its control'],
  ['w-3', '3 · 12 px', 'between blocks in a panel'], ['w-4', '4 · 16 px', 'card padding, the page gutter'], ['w-6', '6 · 24 px', 'between page sections']]
const RADII: [string, string][] = [['rounded-sm', '4 · tags, kbd'], ['rounded-md', '6 · chips, icon buttons, menu items'], ['rounded-lg', '8 · buttons, inputs, callouts'], ['rounded-xl', '12 · cards, panels'], ['rounded-full', 'avatars, pills']]
const SHADOWS: [string, string][] = [['shadow-xs', 'cards, outline buttons'], ['shadow-sm', 'a card on a card, the switch knob'], ['shadow-md', 'menus, the ⌘K palette, tooltips']]
const MOTION: [string, string, string][] = [['--dur-fast', 'duration-fast', 'hover, colour, a card appearing under the line'], ['--dur-base', 'duration-base', 'fold chevrons, tabs, the switch, the segmented thumb'], ['--dur-slow', 'duration-slow', 'a section opening, a tab change']]
const LAYERS: [string, string, string][] = [['--z-raised', 'z-raised', 'a label inside an input'], ['--z-sticky', 'z-sticky', 'the banner, the queue strip, the bench footer'],
  ['--z-popover', 'z-popover', 'menus, tooltips'], ['--z-overlay', 'z-overlay', 'the ⌘K scrim'], ['--z-toast', 'z-toast', 'a toast']]

/** each [data-size] sample's font size and line height, as drawn; the root's motion and layer variables */
const readSizes = (el: HTMLElement) => Object.fromEntries([...el.querySelectorAll<HTMLElement>('[data-size]')].map((n) => { const s = getComputedStyle(n); return [n.dataset.size!, `${parseFloat(s.fontSize)} / ${parseFloat(s.lineHeight)}`] }))
const readVars = (el: HTMLElement) => { const s = getComputedStyle(el); return Object.fromEntries([...MOTION, ...LAYERS].map(([v]) => [v, s.getPropertyValue(v).trim()])) }
const NONE: Record<string, string> = {}

export function TypeSpace({ side }: { side: boolean }) { return <Columns side={side}><Body /></Columns> }

function Body() {
  const { ref: sizesRef, value: sizes, key: sizesKey } = useLive(readSizes, NONE); const { ref: varsRef, value: vars, key: varsKey } = useLive(readVars, NONE)
  const still = useMedia('(prefers-reduced-motion: reduce)'); const [moved, setMoved] = useState(false)
  return <div className="grid gap-6">
    <Group title="Type" hint="Inter Variable (cv11 ss01 ss03); sizes are named by their pixels, each with its own line height">
      <div key={sizesKey} ref={sizesRef} className="grid gap-3">{SIZES.map(([c, w, use]) => <div key={c} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[7rem_1fr]">
        <p className="font-mono text-11 text-faint">{c}<span className="block tnum">{sizes[c] ?? '…'} px · {w}</span></p>
        <p className="min-w-0"><span data-size={c} className={cn('block truncate text-fg', c, c === 'text-18' || c === 'text-22' ? 'font-semibold tracking-tight' : c === 'text-16' && 'font-semibold')}>Demo Patient · 7.2 % · 14:05</span><span className="text-12 text-faint">{use}</span></p>
      </div>)}</div>
      <Sample title="Weights">{WEIGHTS.map(([c, l]) => <span key={c} className={cn('text-14 text-fg', c)}>{l}</span>)}</Sample>
      <Sample title="Figures" note="tnum where numbers line up in columns; a lone big number keeps proportional figures">
        <span className="grid text-end text-14 text-fg tnum"><span>11:05</span><span>09:47</span><span>1,118.50</span></span>
        <span className="grid text-end text-14 text-fg"><span>11:05</span><span>09:47</span><span>1,118.50</span></span>
        <span className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">Overline: text-11 semibold uppercase</span>
      </Sample>
    </Group>
    <Group title="Space and shape" hint="Tailwind's 4 px grid, no new tokens; control heights 24 · 28 · 36 · 44">
      <div className="grid gap-1.5">{SPACE.map(([c, l, use]) => <p key={c} className="flex items-center gap-3 text-12"><span className="w-8 shrink-0"><span className={cn('block h-3 rounded-sm bg-accent', c)} /></span><span className="w-24 shrink-0 font-mono text-11 text-muted tnum">{l}</span><span className="text-faint">{use}</span></p>)}</div>
      <Sample title="Radii" note="Tailwind's own values, locked">{RADII.map(([c, l]) => <span key={c} className={cn('grid min-h-14 w-32 place-content-center bg-sunken px-2 py-2 text-center text-11 text-muted ring-1 ring-inset ring-line-strong', c)}>{c}<br />{l}</span>)}</Sample>
      <Sample title="Shadows" note="on the canvas and on a card; in dark, elevation is a lighter step and a light inner edge">
        {['bg-canvas', 'bg-surface'].map((bg) => <div key={bg} className={cn('flex flex-wrap gap-3 rounded-lg p-3 ring-1 ring-inset ring-line', bg)}>{SHADOWS.map(([c, l]) =>
          <span key={c} className={cn('grid h-14 w-32 place-content-center rounded-lg bg-raised px-2 text-center text-11 text-muted', c)}><b className="font-mono font-medium text-fg">{c}</b>{l}</span>)}</div>)}
      </Sample>
    </Group>
    <div key={varsKey} ref={varsRef} className="grid gap-6">
      <Group title="Motion" hint={still ? 'Reduced motion: on (the system asks for it, so every duration is 0 ms)' : 'Reduced motion: off. Only opacity, transform and colour move, never layout, and the record never moves when data refreshes.'}>
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setMoved(!moved)}>Run each duration</Button>
        <div className="grid gap-2">{MOTION.map(([v, c, use]) => <div key={v} className="grid gap-x-3 sm:grid-cols-[12rem_1fr]">
          <p className="font-mono text-11 text-muted">{c} · <span className="tnum">{vars[v] || '…'}</span><span className="block font-sans text-12 text-faint">{use}</span></p>
          <div className="h-6 rounded-md bg-sunken p-1"><span className={cn('block size-4 rounded-sm bg-accent transition-transform ease-out', c, moved && 'translate-x-40 rtl:-translate-x-40')} /></div>
        </div>)}</div>
      </Group>
      <Group title="Layers" hint="utilities only; no numeric z-* outside the kit">
        <div className="divide-y divide-line rounded-lg ring-1 ring-inset ring-line">{LAYERS.map(([v, c, use]) => <p key={v} className="grid grid-cols-[6rem_2rem_1fr] gap-3 px-3 py-1.5 text-12"><span className="font-mono text-11 text-fg">{c}</span><span className="text-muted tnum">{vars[v] || '…'}</span><span className="text-faint">{use}</span></p>)}</div>
      </Group>
    </div>
    <Group title="Breakpoints and frames" hint="Tailwind's sm md lg xl 2xl stay; one is added">
      <div className="grid gap-1 text-12 text-muted">
        <p><span className="font-mono text-11 text-fg">split: · @split:</span> 640 px: from a phone's width up, the record panel sits beside the encounter (SplitPane answers to its own width)</p>
        <p><span className="font-mono text-11 text-fg">max-w-page</span> 72 rem: settings, the desk, a bench, the bed board · <span className="font-mono text-11 text-fg">max-w-chart</span> 96 rem: the patient chart</p></div>
    </Group>
  </div>
}
