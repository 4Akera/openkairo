// A tube's cap (spec/openCare.md §5.3): its colour by the laboratory's own code, never alone (its word beside it). Pure.
export const Cap = ({ cap, big }: { cap: string; big?: boolean }) =>
  <span aria-hidden className={big ? 'inline-block h-5 w-3.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong' : 'inline-block h-3.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong'}
    style={{ background: `var(--tube-${cap})` }} />
