// A print in the read log (spec/openCare.md §3.13 Printing, the owner's (p4), 2026-10-08): the reader's shape printed keeps, in the row of
// that person, patient and purpose, each print's printout and the thing it carried. Pure: Settings → Record reads says it in words.

/** what a row printed: the printout's own word and the thing it carried (a sample number, a receipt), "labels S-1008-0001, receipt
 *  R-00412"; an id says nothing to a person, so it is left out */
export const printedOf = (what: Record<string, unknown>) => ((what.prints as { printout?: string; what?: string }[] | undefined) ?? [])
  .map((p) => [p.printout?.split('.').pop()?.replace(/_/g, ' '), p.what && !/^[0-9a-f-]{36}$/i.test(p.what) ? p.what : null].filter(Boolean).join(' ')).filter(Boolean).join(', ')
