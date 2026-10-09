// The anaesthesia pack's words and arithmetic (spec/openCare.md §5.8; the pictures #anaes-preop, #anaes-record, and Recovery's): the
// clinic's list of medicines to stop matched against a patient's current ones (shown, never a stop), the anaesthetic's risks to tell
// by plan, the record's 5-minute columns, and recovery's line (minutes in, Aldrete first → last, pain, ready for the ward at 9 or
// more). Pure: a node test imports it.

export interface StopRule { match: string; what: string; days?: number; rule?: string; warn?: boolean }
type SettingsOrg = { organization: { id: string }; settings: { key: string; thing_id: string; data: Record<string, unknown> }[] }
export const stopRulesOf = (org: SettingsOrg | null | undefined): StopRule[] =>
  ((org?.settings.find((s) => s.key === 'anaesthesia.stop_list' && s.thing_id === org.organization.id)?.data ?? {}) as { rules?: StopRule[] }).rules ?? []
export interface Med { drug_name: string; drug_code: string | null; dose_number: number | null; dose_unit: string | null; frequency: string | null; status: string }
export interface StopLine { medicine: string; what: string; rule: string; days?: number; warn: boolean }
/** each current medicine against the clinic's list: the first rule whose names or ATC codes match it; none matched: "ask" */
export function stopLines(meds: Med[], rules: StopRule[]): StopLine[] {
  return meds.filter((m) => m.status === 'active').map((m) => {
    const name = m.drug_name.toLowerCase(); const atc = (m.drug_code ?? '').replace(/^atc:/, '').toUpperCase()
    const r = rules.find((x) => x.match.split(',').map((w) => w.trim()).filter(Boolean).some((w) => /^[A-Z]\d{2}[A-Z0-9]*$/.test(w) ? !!atc && atc.startsWith(w) : name.includes(w.toLowerCase())))
    const medicine = `${m.drug_name}${m.dose_number ? ` ${m.dose_number} ${m.dose_unit ?? 'mg'}` : ''}${m.frequency && m.frequency !== 'OD' ? ` ${m.frequency === 'BD' ? 'twice' : m.frequency}` : ''}`
    return r ? { medicine, what: r.what, rule: r.rule ?? r.what, ...(r.days != null ? { days: r.days } : {}), warn: !!r.warn } : { medicine, what: 'ask the anaesthetist', rule: 'not on the clinic\'s list', warn: false }
  })
}
export type Plan = 'general_lma' | 'general_tube' | 'spinal' | 'local_sedation'
export const PLANS: [Plan, string][] = [['general_lma', 'General · LMA'], ['general_tube', 'General · tube'], ['spinal', 'Spinal'], ['local_sedation', 'Local and sedation']]
/** the anaesthetic's risks to tell, by plan */
export const RISKS: Record<Plan, string[]> = {
  spinal: ['headache after a spinal · about 1 in 100', 'low blood pressure', 'the spinal may not work: a general', 'lasting nerve damage · very rare'],
  general_lma: ['sore throat', 'sickness · about 1 in 10', 'damage to teeth · about 1 in 4 500', 'awareness · very rare'],
  general_tube: ['sore throat · about 1 in 2', 'sickness · about 1 in 10', 'damage to teeth · about 1 in 4 500', 'awareness · about 1 in 20 000'],
  local_sedation: ['it may not numb enough: more local or a general', 'drowsy for some hours'],
}
export const ASA = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const
/** the history the pre-op asks, in its order */
export const HISTORY: [string, string][] = [['heart', 'Heart'], ['chest', 'Chest'], ['sleep', 'Sleep'], ['diabetes', 'Diabetes'], ['bleeding', 'Bleeding'], ['teeth', 'Teeth, reflux'], ['before', 'Before']]
/** the clinic's Arabic sheet for the patient: what to take and stop, and fasting (the printed copy waits for printing) */
export function arabicSheet(lines: StopLine[]): string {
  const stop = lines.filter((l) => /stop/i.test(l.what)).map((l) => `أوقف ${l.medicine.split(' ')[0]} قبل العملية ${l.days ? `بـ ${l.days} أيام` : ''}`.trim())
  const omit = lines.filter((l) => /no dose|omit|morning of/i.test(l.what)).map((l) => l.medicine.split(' ')[0])
  const keep = lines.filter((l) => /continue/i.test(l.what)).map((l) => l.medicine.split(' ')[0])
  return [omit.length ? `لا تأخذ ${omit.join(' ولا ')} صباح يوم العملية.` : '', ...stop.map((s) => `${s}.`), keep.length ? `استمر على ${keep.join(' و')}.` : '',
    'لا أكل قبل العملية بست ساعات، والماء مسموح حتى ساعتين قبلها.'].filter(Boolean).join(' ')
}

// ── the record's grid ──
/** the 5-minute columns from the anaesthetic's start to now (HH:MM), at most n */
export function columns(start: string, now: string, n = 36): string[] {
  const m = (s: string) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm }
  const a = Math.floor(m(start) / 5) * 5; const b = Math.max(a, m(now)); const out: string[] = []
  for (let t = a; t <= b && out.length < n; t += 5) out.push(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  return out
}
export const ROWS: { key: string; label: string; unit?: string; group?: string; carry?: boolean }[] = [
  { key: 'hr', label: 'Heart rate', group: 'Vitals' }, { key: 'bp', label: 'BP', unit: 'mmHg' }, { key: 'spo2', label: 'SpO₂', unit: '%' }, { key: 'etco2', label: 'EtCO₂', unit: 'mmHg' },
  { key: 'temp', label: 'Temperature', unit: '°C' }, { key: 'agent_pct', label: 'Sevoflurane', unit: '%', group: 'Gas', carry: true }, { key: 'fio2', label: 'FiO₂', carry: true }]
/** a blank keeps the last setting (the gas, FiO₂): the value carried from the column before, and whether it was typed here */
export function carried(cells: Record<string, string>[], key: string, i: number): { v: string; typed: boolean } {
  if (cells[i]?.[key]) return { v: cells[i][key], typed: true }
  for (let j = i - 1; j >= 0; j--) if (cells[j]?.[key]) return { v: cells[j][key] === 'off' ? '' : cells[j][key], typed: false }
  return { v: '', typed: false }
}
/** a dose per kg, shown beside it (never a stop) */
export const perKg = (dose: number, kg: number | null | undefined) => kg ? Math.round(dose / kg * 10) / 10 : null

// ── recovery's line ──
export interface RecRow { patient_id: string; kind: 'aldrete' | 'pain'; value: number; at: string }
export const READY = 9
/** the tile's words: minutes in, Aldrete first → last (ok at 9 or more, else amber), pain, "ready for the ward" */
export function recoveryWords(rows: RecRow[], patientId: string, since: string, now = Date.now()): (string | { text: string; tone: 'ok' | 'warn' })[] {
  const mine = rows.filter((r) => r.patient_id === patientId && r.at >= since).sort((a, b) => a.at.localeCompare(b.at))
  const ald = mine.filter((r) => r.kind === 'aldrete'); const pain = mine.filter((r) => r.kind === 'pain').pop()
  const min = Math.max(0, Math.round((now - Date.parse(since)) / 60_000))
  const out: (string | { text: string; tone: 'ok' | 'warn' })[] = [`in ${min} min`]
  if (ald.length) { const first = ald[0].value; const last = ald[ald.length - 1].value
    out.push({ text: `Aldrete ${ald.length > 1 && first !== last ? `${first} → ${last}` : last}`, tone: last >= READY ? 'ok' : 'warn' }) }
  if (pain) out.push(`pain ${pain.value}`)
  if (ald.length && ald[ald.length - 1].value >= READY) out.push({ text: 'ready for the ward', tone: 'ok' })
  return out
}
