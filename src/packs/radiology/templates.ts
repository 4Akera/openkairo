// A report template is one of Radiology's presets (spec/openCare.md §5.5: "Templates are the department's presets"): its lines, the
// one starting "Impression:" the impression, the rest the findings ("Findings:" dropped). Pure.
export function templateOf(lines: string[]): { findings: string; impression: string } {
  const imp = lines.filter((l) => /^impression:/i.test(l.trim())).map((l) => l.trim().replace(/^impression:\s*/i, ''))
  const rest = lines.filter((l) => !/^impression:/i.test(l.trim())).map((l) => l.replace(/^findings:\s*/i, ''))
  return { findings: rest.join('\n').trim(), impression: imp.join('\n').trim() }
}
/** this kind's templates first (named for it: "Normal CT brain" for a CT), else every one */
const WORD: Record<string, RegExp> = { 'X-ray': /x-ray/i, Ultrasound: /\bus\b|ultrasound/i, CT: /\bct\b/i, MRI: /\bmri\b/i }
export function templatesFor<T extends { name: string }>(all: T[], kind: string | null | undefined): T[] {
  const w = kind ? WORD[kind] : undefined; const mine = w ? all.filter((t) => w.test(t.name)) : []
  return mine.length ? mine : all
}
