// The screens' view models, built from what read() returns (spec/openCare.md §3.10). Pure: no fetching here.
import type {
  Allergy, Card, DeceasedRow, Department, Flag, Identity, ListReview, Medication, OrderRow, Organization, PatientBanner, PatientHit, Place, PresenceRow, Problem,
  QueueRow, RecentRow, RecordView, RequestQueueRow, ResultRow, ServerEntry, ServerMe, ServerRecord, Service, ServiceField, SettingRow, TableRead, Template, Value, ValueRow, VisitRow, VisitStatus,
} from './types'

// ── time and people ──
/** years from a birth date written YYYY[-MM[-DD]] */
export function ageOf(born: string | null | undefined, now = new Date()) {
  if (!born) return 0
  const [y, m = 1, d = 1] = born.slice(0, 10).split('-').map(Number)
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0)
}
const bornText = (i: Identity) => !i.birth_date ? '' : i.birth_precision === 'year' ? i.birth_date.slice(0, 4) : i.birth_precision === 'month' ? i.birth_date.slice(0, 7) : i.birth_date
export const phoneOf = (i: Identity) => i.telecom.find((t) => t.system === 'phone')?.value ?? null
export function banner(i: Identity, deceased?: DeceasedRow | null): PatientBanner {
  const words = i.full_name.split(/\s+/)
  const given = i.given[0] ?? words[0] ?? ''
  return { id: i.id, record_number: i.number, given_name: given, middle_name: i.given.slice(1).join(' ') || null, family_name: i.family ?? (words.slice(1).join(' ') || ''),
    sex: i.gender, born_on: bornText(i), age: ageOf(i.birth_date), died_on: deceased?.at ?? null, merged_into_id: i.merged_into, phone_text: phoneOf(i) }
}

// ── the directory: the organization, its departments, services, presets, people and roles ──
const WORK_TYPE: Record<string, string> = { desk: 'reception', visits: 'clinic', stays: 'ward', bench: 'ancillary', outside: 'outside' }
/** a department's default screen, by its work */
export const DEFAULT_SCREEN: Record<string, string> = { desk: 'base.desk', visits: 'base.queue', stays: 'base.beds', bench: 'base.bench', outside: 'base.bench' }
function current(settings: SettingRow[]) {
  const by = new Map<string, SettingRow>()
  for (const s of settings) by.set(`${s.key}|${s.thing_id}`, s)
  return { one: (key: string, thing: string) => by.get(`${key}|${thing}`)?.data, many: (key: string) => settings.filter((s) => s.key === key) }
}
const ids = (d: Record<string, unknown> | undefined): (string | null)[] => !d || d.all || !Array.isArray(d.departments) || !(d.departments as string[]).length ? [null] : d.departments as string[]
const fieldOf = (f: Record<string, unknown>, i: number): ServiceField => {
  const c = f.coding as { system: string; code: string } | undefined
  return { position: i + 1, key: String(f.key ?? `f${i + 1}`), code: c ? `${c.system}:${c.code}` : '', name: String(f.name ?? ''), kind: String(f.kind ?? 'number'), unit: (f.unit as string) ?? null, ucum: (f.ucum as string) ?? null,
    choices: (f.choices as string[]) ?? null, reference_low: (f.low as number) ?? null, reference_high: (f.high as number) ?? null, critical_low: (f.critical_low as number) ?? null, critical_high: (f.critical_high as number) ?? null,
    ranges: ((f.ranges as Record<string, number | string>[]) ?? []).map((r) => ({ gender: (r.gender as 'male' | 'female') ?? null, age_low: (r.age_low as number) ?? null, age_high: (r.age_high as number) ?? null,
      low: (r.low as number) ?? null, high: (r.high as number) ?? null, critical_low: (r.critical_low as number) ?? null, critical_high: (r.critical_high as number) ?? null })) }
}
export function directory(m: ServerMe): Organization {
  const s = current(m.settings)
  const site = (id: string | null) => m.sites.find((x) => x.id === id)?.name ?? null
  const all: Department[] = m.departments.map((d) => {
    const screens = (s.one('department.screens', d.id)?.screens as string[] | undefined) ?? [DEFAULT_SCREEN[d.work]]
    return { id: d.id, name: d.name, work: d.work, type: d.work === 'bench' && screens.some((x) => x.startsWith('pharmacy.')) ? 'pharmacy' : WORK_TYPE[d.work], is_visited: d.work === 'visits' || d.work === 'stays',
      is_outside: d.work === 'outside', site_name: site(d.site_id), position: d.position, serves: ids(s.one('department.works_for', d.id)), checks_in_for: ids(s.one('department.checks_in_for', d.id)),
      patients_wait: (s.one('department.patients_wait', d.id)?.wait as boolean | undefined) ?? true, review_results: (s.one('department.review_results', d.id)?.level as Department['review_results']) ?? 'critical',
      is_private: !!s.one('department.private', d.id)?.private, after_done: (s.one('department.after_done', d.id)?.after as Department['after_done']) ?? 'next', pack_cards: true,
      screens, opens: (s.one('department.screens', d.id)?.opens as string | undefined) ?? screens[0] ?? null, encounter_class: (s.one('department.encounter_class', d.id)?.class as string | undefined) ?? null }
  })
  const live = all.filter((d) => !m.departments.find((x) => x.id === d.id)?.retired_at)
  const services: Service[] = s.many('service').map((r) => ({ id: r.thing_id, department_id: r.owner_id, section_name: (r.data.section as string) ?? null, code: String(r.data.code ?? ''),
    name: String(r.data.name ?? ''), reply_type: String(r.data.answer ?? 'result'), coding: (r.data.coding as Service['coding']) ?? null,
    fields: ((r.data.fields as Record<string, unknown>[]) ?? []).map(fieldOf) }))
  const templates: Template[] = s.many('preset').map((r) => ({ id: r.thing_id, department_id: (r.data.department_id as string) ?? null, name: String(r.data.name ?? ''),
    items: ((r.data.services as string[]) ?? []).map((service_id) => ({ service_id })), shortcut: (r.data.shortcut as string) ?? null, lines: (r.data.lines as string[]) ?? [] }))
  const places: Place[] = m.places.filter((p) => !p.retired_at).map((p) => ({ ...p, closed: !!s.one('place.closed', p.id)?.closed }))
  const everywhere = m.me.holdings.some((h) => h.department_id === null)
  const mine = everywhere ? live : live.filter((d) => m.me.holdings.some((h) => h.department_id === d.id))
  const roleKey = (id: string) => m.roles.find((r) => r.id === id)?.key ?? ''
  return {
    organization: { id: m.organization.id, name: m.organization.name, time_zone: m.organization.time_zone, record_view: (s.one('organization.record_view', m.organization.id)?.view as 'visits' | 'entries') ?? 'visits' },
    me: { id: m.me.id, name: m.me.name, kind: m.me.kind, departments: mine.filter((d) => d.work !== 'outside'), actions: [...new Set(m.me.holdings.flatMap((h) => h.actions))],
      works_in: m.me.holdings.map((h) => h.department_id).filter((x): x is string => !!x), holdings: m.me.holdings },
    departments: live, allDepartments: all, services, templates, places,
    packs: m.registry.packs.map((p) => ({ key: p.key, name: p.labels.en ?? p.key, enabled: p.used, stale: p.stale })),
    users: m.users.map((u) => ({ id: u.id, name: u.name, kind: u.kind, title: u.title, retired_at: u.retired_at, accepted_at: u.signed_in_at, has_login: u.has_login,
      roles: m.holdings.filter((h) => h.user_id === u.id).map((h) => ({ role_id: h.role_id, role_key: roleKey(h.role_id), department_id: h.department_id })) })),
    roles: m.roles.filter((r) => !r.retired_at).map((r) => ({ id: r.id, key: r.key, name: r.name, is_builtin: r.builtin, actions: r.actions, every_action: r.every_action })),
    actions: m.actions.map((a) => ({ key: a.key, layer: a.layer, label: a.labels.en ?? a.key })), types: m.registry.types, screens: m.registry.screens,
    parked_pack_calls: m.registry.packs.reduce((n, p) => n + p.stale, 0), loginUsers: m.users_of_login,
  }
}
/** may I do this here: a role held in this department or everywhere */
export const mayIn = (o: Organization | undefined, action: string, departmentId: string | null | undefined) =>
  !!o?.me.holdings.some((h) => (h.department_id === null || h.department_id === departmentId) && h.actions.includes(action))
export const nameOf = (o: Organization | undefined, id: string | null | undefined) => (id && (o?.allDepartments.find((d) => d.id === id)?.name ?? o?.users.find((u) => u.id === id)?.name)) || null
export const userName = (o: Organization | undefined, id: string | null | undefined) => (id && o?.users.find((u) => u.id === id)?.name) || null

// ── entries as record lines ──
const WORST: Record<string, number> = { N: 0, NEG: 0, POS: 1, L: 1, H: 1, A: 1, LL: 2, HH: 2, AA: 2 }
export function flagOfResult(e: Pick<ServerEntry, 'type' | 'data'>): Flag | null {
  const as = (e.data?.analytes as { interpretation?: string }[] | undefined) ?? []
  if (!as.length) return null
  const w = Math.max(...as.map((a) => WORST[a.interpretation ?? 'N'] ?? 0))
  if (w === 2) return 'critical'
  if (w === 1) return as.some((a) => a.interpretation === 'L') && !as.some((a) => a.interpretation === 'H') ? 'low' : as.some((a) => a.interpretation === 'H') && !as.some((a) => a.interpretation === 'L') ? 'high' : 'abnormal'
  return 'normal'
}
const OPEN = new Set(['active', 'in-progress', 'on-hold'])
/** an order's step in the bench's words: sent (nobody started), started, held, replied (a preliminary answer), a pack's own step, or how it ended */
export const stepOf = (x: OrderRow) => x.status === 'on-hold' ? 'held' : !OPEN.has(x.status) ? x.status
  : x.step_key ?? (x.answers.length && !x.final ? 'replied' : x.status === 'in-progress' ? 'started' : 'sent')
export function card(e: ServerEntry, o: Organization | undefined, order?: OrderRow, entries?: Record<string, ServerEntry>): Card {
  const answer = order?.answers.length && entries ? entries[order.answers[order.answers.length - 1]] : undefined
  const reply = answer && !answer.hidden ? answer : undefined
  return {
    id: e.id, type: e.type, item: e.item, item_version: e.item_version, occurred_at: e.occurred_at, recorded_at: e.recorded_at, author_id: e.author_id ?? null, author_name: userName(o, e.author_id),
    department_id: e.department_id, department_name: nameOf(o, e.department_id), display_line: e.line, flag: e.type.endsWith('result') ? flagOfResult(e) : null,
    is_final: !(e.data?.status === 'preliminary'), source: e.source, reply_to_id: e.relation === 'answers' ? e.refers_to : null, replaces_id: e.replaces, replaced_by_id: null,
    visit_id: e.visit_id, service_id: (e.data?.service as { id?: string } | undefined)?.id ?? null, is_hidden: e.hidden, redacted: e.redacted, findings: e.findings, data: e.data, patient_id: e.patient_id,
    request: order ? { step: stepOf(order), status: OPEN.has(order.status) ? 'open' : order.status === 'completed' ? 'done' : 'cancelled', status_reason: null,
      to_department_id: order.to_department_id ?? '', to_department_name: nameOf(o, order.to_department_id), priority: order.priority, due_at: order.ordered_at,
      reply_line: answer ? answer.line : null, reply_flag: reply ? flagOfResult(reply) : null, replied_at: order.answered_at, review_needed_at: null, order } : undefined,
  }
}
/** a page of entries as lines, each earlier version marked replaced by the next one in the page */
export function cards(es: ServerEntry[], o: Organization | undefined, orders: OrderRow[] = [], entries: Record<string, ServerEntry> = {}): Card[] {
  const byItem = new Map(orders.map((x) => [x.item, x]))
  const out = es.map((e) => card(e, o, e.type.endsWith('order') ? byItem.get(e.item) : undefined, entries))
  for (const c of out) { const later = out.filter((x) => x.item === c.item && x.item_version > c.item_version).sort((a, b) => a.item_version - b.item_version)[0]; if (later) c.replaced_by_id = later.id }
  return out
}

// ── visits and the queue ──
const STATUS: Record<string, VisitStatus> = { waiting: 'waiting', back: 'pending', called: 'in_consult', with: 'in_consult', pending: 'pending', done: 'done', left: 'left', admitted: 'in_consult', discharged: 'done' }
export const isOpen = (p: Pick<PresenceRow, 'state'>) => !['done', 'left', 'discharged'].includes(p.state)
export function visitRow(p: PresenceRow, earlier = 0): VisitRow {
  return { id: p.item, patient_id: p.patient_id, department_id: p.department_id, request_id: p.for_order, assignee_id: p.assigned_id ?? (p.state === 'called' || p.state === 'with' ? p.called_by : p.state === 'back' ? p.seen_by : null),
    status: STATUS[p.state] ?? 'waiting', priority: p.urgent ? 'urgent' : 'routine', is_first: earlier === 0, arrived_at: p.checked_in_at, present_at: p.here ? p.checked_in_at : null,
    seen_at: p.seen_at, ended_at: p.ended_at, called_at: p.called_at, missed_calls: p.missed, kind: p.kind, place_id: p.place_id, latest_entry: p.latest_entry, version: p.version, wait: p.wait, presence: p }
}
export const bandOf = (p: PresenceRow): QueueRow['band'] => p.state === 'called' || p.state === 'with' ? 'consult' : p.state === 'pending' ? 'pending' : p.state === 'back' ? 'back' : 'waiting'
/** Away for more than 30 minutes reads as not here (spec §4.2, worked out when reading) */
export const presentNow = (p: PresenceRow, now = Date.now()) => p.here && !(p.away_since && now - Date.parse(p.away_since) > 30 * 60_000)
export function queueRows(read: TableRead<PresenceRow>, o: Organization | undefined, orders: OrderRow[] = [], allergic: Set<string> = new Set(), history: Map<string, number> = new Map()): QueueRow[] {
  const order = { urgent: 0, routine: 1 } as const
  return read.rows.filter(isOpen).map((p) => {
    const i = read.patients[p.patient_id]; const b = banner(i); const v = visitRow(p, history.get(`${p.patient_id}|${p.department_id}`) ?? 0)
    const reqs = orders.filter((x) => x.visit_id === p.item)
    return { id: p.item, patient: { id: p.patient_id, record_number: b.record_number, given_name: b.given_name, family_name: b.family_name, sex: b.sex, age: b.age, has_allergies: allergic.has(p.patient_id) },
      status: v.status, band: bandOf(p), priority: v.priority, is_first: v.is_first, assignee_id: v.assignee_id, assignee_name: userName(o, v.assignee_id), arrived_at: p.checked_in_at,
      present_at: presentNow(p) ? (p.called_at ?? p.checked_in_at) : null, seen_at: p.seen_at, request_id: p.for_order, request_open: !!p.for_order, called_at: p.called_at, missed_calls: p.missed,
      has_vitals: p.has_vitals, present: presentNow(p), visit: v,
      requests: reqs.map((x) => ({ request_id: x.item, service_name: x.service_name, to_department_name: nameOf(o, x.to_department_id), step: stepOf(x),
        is_holding: OPEN.has(x.status), type: 'order', replied: x.answers.length > 0 || x.status === 'completed' })) }
  }).sort((a, b) => order[a.priority === 'routine' ? 'routine' : 'urgent'] - order[b.priority === 'routine' ? 'routine' : 'urgent'] || Date.parse(a.arrived_at) - Date.parse(b.arrived_at))
}

// ── the bench ──
export function benchRow(x: OrderRow, read: TableRead<OrderRow>, o: Organization | undefined, here?: boolean): RequestQueueRow {
  const e = read.entries[x.latest_entry]; const first = Object.values(read.entries).find((y) => y.item === x.item && y.item_version === 1) ?? e
  const i = read.patients[x.patient_id]; const b = banner(i); const svc = o?.services.find((s) => s.id === x.service_id)
  const c = card(e, o, x, read.entries)
  return { ...c, occurred_at: x.ordered_at, author_name: userName(o, x.requester_id), service_id: x.service_id, patient: { id: x.patient_id, record_number: b.record_number, given_name: b.given_name, family_name: b.family_name, sex: b.sex, born_on: b.born_on, here },
    from_department_name: nameOf(o, x.from_department_id), requester_name: userName(o, x.requester_id), question_text: (first?.data?.question as string) ?? null,
    section_name: svc?.section_name ?? null, service_name: x.service_name, reply_type: svc?.reply_type ?? (first?.data?.service as { answer?: string } | undefined)?.answer ?? 'result',
    assignee_id: null, details: (first?.data?.details as Record<string, unknown>) ?? null, order: x }
}
export function recentRow(x: OrderRow, read: TableRead<OrderRow>, o: Organization | undefined): RecentRow {
  const base = benchRow(x, read, o)
  const last = x.answers.length ? read.entries[x.answers[x.answers.length - 1]] : undefined
  return { ...base, reply: last ? { id: last.id, item: last.item, version: last.item_version, data: last.data ?? {}, author_name: userName(o, last.author_id), recorded_at: last.recorded_at, is_final: !(last.data?.status === 'preliminary') } : null }
}

// ── the record ──
const ACTIVE_PROBLEM = new Set(['active', 'recurrence', 'relapse'])
export function recordView(r: ServerRecord, o: Organization | undefined, departmentId: string, visitId?: string | null): RecordView {
  const lists = r.tables['base.lists'] ?? { rows: [], entries: {}, patients: {}, withheld: 0 }
  const e = (id: string) => lists.entries[id]
  const problems: Problem[] = lists.rows.filter((x) => x.list === 'problems' && ACTIVE_PROBLEM.has(x.status)).map((x) => { const d = e(x.entry_id)?.data ?? {}; const concept = d.concept as { text: string; codings?: { system: string; code: string }[] }
    return { id: x.item, entry_id: x.entry_id, version: e(x.entry_id)?.item_version ?? 1, code: concept?.codings?.[0] ? `${concept.codings[0].system}:${concept.codings[0].code}` : null, name: concept?.text ?? '',
      status: x.status, onset_on: (d.onset as { value?: string } | undefined)?.value ?? null, note_text: (d.note as string) ?? null,
      certainty: ['provisional', 'unconfirmed', 'differential'].includes(String(d.verification)) ? 'suspected' : 'confirmed', data: d } })
  const medications: Medication[] = lists.rows.filter((x) => x.list === 'medications' && (x.status === 'active' || x.status === 'on-hold')).map((x) => { const d = e(x.entry_id)?.data ?? {}
    const drug = d.drug as { text: string; codings?: { system: string; code: string }[] }; const dos = (d.dosage ?? {}) as { dose?: { value: string; unit?: string }; timing?: { code?: string }; route?: string; as_needed?: boolean; as_needed_for?: string }
    const atc = drug?.codings?.find((c) => c.system === 'atc')
    return { id: x.item, entry_id: x.entry_id, version: e(x.entry_id)?.item_version ?? 1, drug_code: atc ? `atc:${atc.code}` : null, drug_name: drug?.text ?? '', dose_number: dos.dose ? Number(dos.dose.value) : null,
      dose_unit: dos.dose?.unit ?? null, route: dos.route ?? null, frequency: dos.timing?.code ?? (dos.as_needed ? 'PRN' : null), prn: !!dos.as_needed, prn_reason_text: dos.as_needed_for ?? null,
      problem_id: ((d.reasons as { id: string }[] | undefined) ?? [])[0]?.id ?? null, status: x.status, started_on: x.first_at.slice(0, 10), instructions_text: (d.instructions as string) ?? null,
      basis: String(d.basis ?? 'prescribed'), duration_days: (d.duration_days as number) ?? null, data: d } })
  const allergies: Allergy[] = lists.rows.filter((x) => x.list === 'allergies').map((x) => { const d = e(x.entry_id)?.data ?? {}; const concept = d.concept as { text: string; codings?: { system: string; code: string }[] }
    const reactions = (d.reactions as { manifestation: { text: string }; severity?: string }[] | undefined) ?? []
    return { id: x.item, entry_id: x.entry_id, version: e(x.entry_id)?.item_version ?? 1, substance_name: concept?.text ?? '', class_code: null, kind: String(d.type ?? 'allergy'),
      reactions_text: reactions.map((y) => y.manifestation.text).join(', ') || null, severity: reactions.find((y) => y.severity)?.severity ?? null, status: x.status, certainty: (d.verification as string) ?? null, data: d } })
  const review = (list: string): ListReview | null => { const rs = lists.rows.filter((x) => x.list === 'reviews' && e(x.entry_id)?.data?.list === list).sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    const x = rs[0]; if (!x) return null; const en = e(x.entry_id); return { list, reviewed_at: x.changed_at, reviewed_by_id: en?.author_id ?? '', outcome: String(en?.data?.outcome ?? 'reviewed') } }
  const presence = r.tables['base.presence']?.rows ?? []
  const orders = r.tables['base.orders']?.rows ?? []
  const orderEntries = r.tables['base.orders']?.entries ?? {}
  const values = r.tables['base.values']?.rows ?? []
  const deceased = r.tables['base.deceased']?.rows?.[0] ?? null
  const earlier = (p: PresenceRow) => presence.filter((x) => x.department_id === p.department_id && x.checked_in_at < p.checked_in_at).length
  const visits = presence.map((p) => visitRow(p, earlier(p))).sort((a, b) => b.presence.last_at.localeCompare(a.presence.last_at))
  const visit = visitId ? visits.find((v) => v.id === visitId) ?? null : visits.find((v) => v.department_id === departmentId && isOpen(v.presence)) ?? null
  const openOrders = orders.filter((x) => OPEN.has(x.status)).map((x) => orderEntries[x.latest_entry] && card(orderEntries[x.latest_entry], o, x, orderEntries)).filter((x): x is Card => !!x)
  // the latest of each vital sign, for the banner
  const latest = new Map<string, ValueRow>()
  for (const v of values) { const k = v.code ?? v.key; const was = latest.get(k); if (!was || was.at < v.at) latest.set(k, v) }
  const latest_vitals: Value[] = [...latest.values()].map((v) => ({ code: v.code ?? v.key, name: v.name ?? v.key, value_number: v.value, unit: v.unit ?? v.ucum ?? undefined, flag: interp(v.interpretation) }))
  return {
    patient: banner(r.patient, deceased), identity: r.patient, visit, hidden_departments: r.hidden.map((h) => ({ department_id: h.department_id, department_name: nameOf(o, h.department_id) ?? '', notes: h.items })),
    allergies, allergy_review: review('allergies'), problems, problem_review: review('problems'), medications, medication_review: review('medications'),
    open_requests: openOrders, entries: cards(r.entries, o, orders, orderEntries), latest_vitals, visits, values, orders, reviews: r.tables['base.review']?.rows ?? [], server: r,
  }
}
export const interp = (i: string | null | undefined): Flag | null => !i ? null : i === 'N' || i === 'NEG' ? 'normal' : i === 'L' ? 'low' : i === 'H' ? 'high' : i === 'LL' || i === 'HH' || i === 'AA' ? 'critical' : 'abnormal'
/** results over time: one row per test (LOINC code, else the key), newest point first */
export function resultsTable(values: ValueRow[]): ResultRow[] {
  const by = new Map<string, ResultRow>()
  for (const v of values) {
    const k = v.code ?? v.key
    const row = by.get(k) ?? { code: k, name: v.name ?? v.key, unit: v.unit ?? v.ucum, points: [] }
    row.points.push({ at: v.at, value_number: v.value, value_text: null, flag: interp(v.interpretation), entry_id: v.entry_id, corrected: false })
    by.set(k, row)
  }
  for (const r of by.values()) r.points.sort((a, b) => b.at.localeCompare(a.at))
  return [...by.values()]
}
/** a search hit: the identity and where the patient is now */
export function hit(i: Identity, presence: PresenceRow[], o: Organization | undefined): PatientHit {
  return { ...banner(i), identifiers: i.identifiers.map((x) => ({ system: x.system, value: x.value })), identity: i,
    open_visits: presence.filter((p) => p.patient_id === i.id && isOpen(p)).map((p) => ({ id: p.item, department_id: p.department_id, department_name: nameOf(o, p.department_id) ?? '',
      status: STATUS[p.state] ?? 'waiting', present: presentNow(p), arrived_at: p.checked_in_at, assignee_id: p.assigned_id, row: p })) }
}
