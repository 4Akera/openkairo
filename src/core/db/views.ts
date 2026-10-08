// The screens' view models, built from what read() returns (spec/openCare.md §3.10). Pure: no fetching here.
import type {
  Allergy, Card, DeceasedRow, Department, Flag, Identity, ListReview, ListRowData, Medication, OrderRow, Organization, PatientBanner, PatientHit, Place, PresenceRow, Problem,
  QueueRow, RecentRow, RecordView, Reply, RequestQueueRow, ServerEntry, ServerMe, ServerRecord, Service, ServiceField, SettingRow, StepData, TableRead, Template, Value, ValueRow, VisitRow, VisitStatus,
} from './types'
import type { EntryData, SettingData } from './shapes.generated'

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
/** the settings as they stand, each read in its key's declared shape (shapes.generated.ts; write_setting checked it against that shape) */
function current(settings: SettingRow[]) {
  const by = new Map<string, SettingRow>()
  for (const s of settings) by.set(`${s.key}|${s.thing_id}`, s)
  return { one: <K extends keyof SettingData>(key: K, thing: string) => by.get(`${key}|${thing}`)?.data as SettingData[K] | undefined,
    many: <K extends keyof SettingData>(key: K) => settings.filter((s) => s.key === key) as (SettingRow & { data: SettingData[K] })[] }
}
const ids = (d: { all?: boolean; departments?: string[] } | undefined): (string | null)[] => !d || d.all || !d.departments?.length ? [null] : d.departments
const fieldOf = (f: NonNullable<SettingData['service']['fields']>[number], i: number): ServiceField => {
  const c = f.coding
  return { position: i + 1, key: f.key || `f${i + 1}`, code: c ? `${c.system}:${c.code}` : '', name: f.name, kind: f.kind ?? 'number', unit: f.unit ?? null, ucum: f.ucum ?? null,
    choices: f.choices ?? null, reference_low: f.low ?? null, reference_high: f.high ?? null, critical_low: f.critical_low ?? null, critical_high: f.critical_high ?? null,
    ranges: (f.ranges ?? []).map((r) => ({ gender: r.gender ?? null, age_low: r.age_low ?? null, age_high: r.age_high ?? null,
      low: r.low ?? null, high: r.high ?? null, critical_low: r.critical_low ?? null, critical_high: r.critical_high ?? null })) }
}
export function directory(m: ServerMe): Organization {
  const s = current(m.settings)
  const site = (id: string | null) => m.sites.find((x) => x.id === id)?.name ?? null
  // the Screens line and the packs used here come with the department (read 'me'): the client never guesses them
  const all: Department[] = m.departments.map((d) => {
    return { id: d.id, name: d.name, work: d.work, type: WORK_TYPE[d.work], is_visited: d.work === 'visits' || d.work === 'stays',
      is_outside: d.work === 'outside', site_id: d.site_id, site_name: site(d.site_id), position: d.position, serves: ids(s.one('department.works_for', d.id)), checks_in_for: ids(s.one('department.checks_in_for', d.id)),
      review_results: s.one('department.review_results', d.id)?.level ?? 'critical',
      is_private: !!s.one('department.private', d.id)?.private, after_done: s.one('department.after_done', d.id)?.after ?? 'next', pack_cards: true,
      screens: d.screens ?? [], opens: d.opens ?? d.screens?.[0] ?? null, packs: d.packs ?? [], declared: d.declared ?? {}, encounter_class: s.one('department.encounter_class', d.id)?.class ?? null,
      setup: s.one('department.setup', d.id)?.setup ?? null }
  })
  const live = all.filter((d) => !m.departments.find((x) => x.id === d.id)?.retired_at)
  const services: Service[] = s.many('service').map((r) => ({ id: r.thing_id, department_id: r.owner_id, section_name: r.data.section ?? null, code: r.data.code,
    name: r.data.name, reply_type: r.data.answer ?? 'result', coding: r.data.coding ?? null, fields: (r.data.fields ?? []).map(fieldOf), steps: r.data.steps ?? [] }))
  const templates: Template[] = s.many('preset').map((r) => ({ id: r.thing_id, department_id: r.data.department_id ?? null, name: r.data.name,
    items: (r.data.services ?? []).map((service_id) => ({ service_id })), shortcut: r.data.shortcut ?? null, lines: r.data.lines ?? [] }))
  const places: Place[] = m.places.filter((p) => !p.retired_at).map((p) => { const c = s.one('place.closed', p.id); return { ...p, closed: !!c?.closed, closed_reason: c?.closed ? c.reason ?? null : null } })
  const everywhere = m.me.holdings.some((h) => h.department_id === null)
  const mine = everywhere ? live : live.filter((d) => m.me.holdings.some((h) => h.department_id === d.id))
  const roleKey = (id: string) => m.roles.find((r) => r.id === id)?.key ?? ''
  return {
    organization: { id: m.organization.id, name: m.organization.name, time_zone: m.organization.time_zone, record_view: s.one('organization.record_view', m.organization.id)?.view ?? 'visits' },
    me: { id: m.me.id, name: m.me.name, kind: m.me.kind, departments: mine.filter((d) => d.work !== 'outside'), actions: [...new Set(Object.values(m.me.may ?? {}).flat())],
      works_in: m.me.holdings.map((h) => h.department_id).filter((x): x is string => !!x), holdings: m.me.holdings, may: m.me.may ?? {} },
    departments: live, allDepartments: all, services, templates, places, sites: [...m.sites].sort((a, b) => a.name.localeCompare(b.name)),
    packs: m.registry.packs.map((p) => ({ key: p.key, name: p.labels.en ?? p.key, enabled: p.used, stale: p.stale,
      work: { stale: p.stale, failing: p.failing ?? 0, parked: p.parked ?? 0, waiting: p.waiting ?? 0, catchUp: p.catch_up ?? null } })),
    users: m.users.map((u) => ({ id: u.id, name: u.name, kind: u.kind, title: u.title, retired_at: u.retired_at, accepted_at: u.signed_in_at, has_login: u.has_login,
      roles: m.holdings.filter((h) => h.user_id === u.id).map((h) => ({ role_id: h.role_id, role_key: roleKey(h.role_id), department_id: h.department_id })) })),
    roles: m.roles.filter((r) => !r.retired_at).map((r) => ({ id: r.id, key: r.key, name: r.name, is_builtin: r.builtin, actions: r.actions, every_action: r.every_action,
      built_on: r.built_on ?? null, everyday: !!r.everyday, own: r.own ?? r.actions })),
    actions: m.actions.map((a) => ({ key: a.key, layer: a.layer, label: a.labels.en ?? a.key, everyday: !!a.everyday })), types: m.registry.types, screens: m.registry.screens,
    parked_pack_calls: m.registry.packs.filter((p) => p.used).reduce((n, p) => n + (p.parked ?? 0) + (p.failing ?? 0), 0), loginUsers: m.users_of_login,
    settings: m.settings, settingKeys: m.registry.setting_keys ?? [], datatypes: m.registry.datatypes ?? {}, scores: m.registry.scores ?? [],
    setups: m.registry.setups ?? [],
  }
}
/** may I do this here, as the server's may answers it (a role held here or everywhere; a pack's actions only where the department uses
 *  the pack; a pack's everyday actions for Doctors and Nurses there); no department: only what is held everywhere */
export const mayIn = (o: Organization | undefined, action: string, departmentId: string | null | undefined) =>
  !!o?.me.may[departmentId ?? '']?.includes(action)
/** whether a serving department (a lab, a bench answering prescriptions) works for this one: [null] is every department (department.works_for) */
export function worksFor(org: Pick<Organization, 'allDepartments'> | undefined, providerId: string | null, departmentId: string | null | undefined) {
  if (!providerId) return true
  const s = org?.allDepartments?.find((d) => d.id === providerId)?.serves ?? [null]
  return s.some((x) => x === null || x === departmentId)
}
export const nameOf = (o: Organization | undefined, id: string | null | undefined) => (id && (o?.allDepartments.find((d) => d.id === id)?.name ?? o?.users.find((u) => u.id === id)?.name)) || null
export const userName = (o: Organization | undefined, id: string | null | undefined) => (id && o?.users.find((u) => u.id === id)?.name) || null

// ── entries as record lines ──
/** an entry's data in its type's declared shape (shapes.generated.ts): when the entry is of that type, or of a pack type extending it
 *  (types: the registry's base_type, spec §5); hidden and redacted entries have none. The latest version's shape: a key with a v2
 *  reads older entries as their own version (shapes.generated.ts names each) */
export function dataOf<K extends keyof EntryData>(e: ServerEntry | undefined, type: K, types?: { key: string; base_type: string | null }[]): EntryData[K] | undefined {
  if (!e?.data || (e.type !== type && types?.find((t) => t.key === e.type)?.base_type !== type)) return undefined
  return e.data as EntryData[K]   // the writer checked it against this shape; a pack type's own fields sit under data.<pack>
}
const WORST: Record<string, number> = { N: 0, NEG: 0, POS: 1, L: 1, H: 1, A: 1, LL: 2, HH: 2, AA: 2 }
export function flagOfResult(e: ServerEntry, types?: Organization['types']): Flag | null {
  const as = dataOf(e, 'result', types)?.analytes ?? []
  if (!as.length) return null
  const w = Math.max(...as.map((a) => WORST[a.interpretation ?? 'N'] ?? 0))
  if (w === 2) return 'critical'
  if (w === 1) return as.some((a) => a.interpretation === 'L') && !as.some((a) => a.interpretation === 'H') ? 'low' : as.some((a) => a.interpretation === 'H') && !as.some((a) => a.interpretation === 'L') ? 'high' : 'abnormal'
  return 'normal'
}
const OPEN = new Set(['active', 'in-progress', 'on-hold'])
/** an order's step in the bench's words: sent (nobody started), started, held, replied (a preliminary answer, before any step: it waits
 *  to be made final), the latest step of its service it reached (collected, prepared), or how it ended */
export const stepOf = (x: OrderRow) => x.status === 'on-hold' ? 'held' : !OPEN.has(x.status) ? x.status
  : x.answers.length && !x.final ? 'replied' : x.step_key ?? (x.status === 'in-progress' ? 'started' : 'sent')
export function card(e: ServerEntry, o: Organization | undefined, order?: OrderRow, entries?: Record<string, ServerEntry>): Card {
  const answer = order?.answers.length && entries ? entries[order.answers[order.answers.length - 1]] : undefined
  const reply = answer && !answer.hidden ? answer : undefined
  return {
    id: e.id, type: e.type, item: e.item, item_version: e.item_version, occurred_at: e.occurred_at, recorded_at: e.recorded_at, author_id: e.author_id ?? null, author_name: userName(o, e.author_id),
    department_id: e.department_id, department_name: nameOf(o, e.department_id), display_line: e.line, flag: flagOfResult(e, o?.types),
    is_final: dataOf(e, 'result', o?.types)?.status !== 'preliminary', source: e.source, reply_to_id: e.relation === 'answers' ? e.refers_to : null, replaces_id: e.replaces, replaced_by_id: null,
    visit_id: e.visit_id, service_id: (dataOf(e, 'order', o?.types) ?? dataOf(e, 'result', o?.types))?.service?.id ?? null, is_hidden: e.hidden, redacted: e.redacted, findings: e.findings, data: e.data, patient_id: e.patient_id,
    request: order ? { step: stepOf(order), status: OPEN.has(order.status) ? 'open' : order.status === 'completed' ? 'done' : 'cancelled', status_reason: null,
      to_department_id: order.to_department_id ?? '', to_department_name: nameOf(o, order.to_department_id), priority: order.priority, due_at: order.ordered_at,
      reply_line: answer ? answer.line : null, reply_flag: reply ? flagOfResult(reply, o?.types) : null, replied_at: order.answered_at, review_needed_at: null, order } : undefined,
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
// a stay keeps its own words (§4.2): it is never in consult, and its end is a discharge, not a Done
const STATUS: Record<string, VisitStatus> = { waiting: 'waiting', back: 'pending', called: 'in_consult', with: 'in_consult', pending: 'pending', done: 'done', left: 'left', admitted: 'admitted', discharged: 'discharged' }
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
  return read.rows.filter((p) => isOpen(p) && p.kind === 'visit').map((p) => {   // a stay is the bed board's, never a queue row
    const i = read.patients[p.patient_id]; const b = banner(i); const v = visitRow(p, history.get(`${p.patient_id}|${p.department_id}`) ?? 0)
    const reqs = orders.filter((x) => x.visit_id === p.item)
    return { id: p.item, patient: { id: p.patient_id, record_number: b.record_number, given_name: b.given_name, family_name: b.family_name, sex: b.sex, age: b.age, has_allergies: allergic.has(p.patient_id) },
      status: v.status, band: bandOf(p), priority: v.priority, is_first: v.is_first, assignee_id: v.assignee_id, assignee_name: userName(o, v.assignee_id), arrived_at: p.checked_in_at,
      present_at: presentNow(p) ? (p.called_at ?? p.checked_in_at) : null, seen_at: p.seen_at, request_id: p.for_order, request_open: !!p.for_order, called_at: p.called_at, missed_calls: p.missed,
      has_vitals: p.has_vitals, present: presentNow(p), visit: v, orders: reqs,
      requests: reqs.map((x) => ({ request_id: x.item, service_name: x.service_name, to_department_name: nameOf(o, x.to_department_id), step: stepOf(x),
        is_holding: OPEN.has(x.status), type: 'order', replied: x.answers.length > 0 || x.status === 'completed' })) }
  }).sort((a, b) => order[a.priority === 'routine' ? 'routine' : 'urgent'] - order[b.priority === 'routine' ? 'routine' : 'urgent'] || Date.parse(a.arrived_at) - Date.parse(b.arrived_at))
}

// ── the bench ──
export function benchRow(x: OrderRow, read: TableRead<OrderRow>, o: Organization | undefined, here?: boolean): RequestQueueRow {
  const e = read.entries[x.latest_entry]; const first = Object.values(read.entries).find((y) => y.item === x.item && y.item_version === 1) ?? e
  const i = read.patients[x.patient_id]; const b = banner(i); const svc = o?.services.find((s) => s.id === x.service_id)
  const c = card(e, o, x, read.entries); const asked = dataOf(first, 'order', o?.types)
  return { ...c, occurred_at: x.ordered_at, author_name: userName(o, x.requester_id), service_id: x.service_id, patient: { id: x.patient_id, record_number: b.record_number, given_name: b.given_name, family_name: b.family_name, sex: b.sex, born_on: b.born_on, here },
    from_department_name: nameOf(o, x.from_department_id), requester_name: userName(o, x.requester_id), question_text: asked?.question ?? null,
    section_name: svc?.section_name ?? null, service_name: x.service_name, reply_type: svc?.reply_type ?? asked?.service.answer ?? 'result',
    assignee_id: null, details: asked?.details ?? null, order: x, step_data: x.step_entry ? (read.entries[x.step_entry]?.data as StepData | undefined) ?? null : null, reply: replyOf(x, read, o) }
}
/** an order's latest answer; its time is its clinical time, as the order's answered_at is */
function replyOf(x: OrderRow, read: TableRead<OrderRow>, o: Organization | undefined): Reply | null {
  const last = x.answers.length ? read.entries[x.answers[x.answers.length - 1]] : undefined
  return last ? { id: last.id, item: last.item, version: last.item_version, data: last.data ?? {}, author_id: last.author_id ?? null, author_name: userName(o, last.author_id),
    recorded_at: last.occurred_at, is_final: dataOf(last, 'result', o?.types)?.status !== 'preliminary' } : null
}
export const recentRow = (x: OrderRow, read: TableRead<OrderRow>, o: Organization | undefined): RecentRow => ({ ...benchRow(x, read, o), reply: replyOf(x, read, o) })

// ── the lists: a row as the screens show it, built from any version of its item (the chart draws the version before a change too) ──
type Types = Organization['types'] | undefined
export function problemOf(x: ListRowData, en: ServerEntry | undefined, types: Types): Problem {
  const d = dataOf(en, 'problem', types); const c = d?.concept.codings?.[0]
  return { id: x.item, entry_id: en?.id ?? x.entry_id, version: en?.item_version ?? 1, code: c ? `${c.system}:${c.code}` : null, name: d?.concept.text ?? '',
    status: d?.clinical_status ?? x.status, onset_on: d?.onset?.value ?? null, note_text: d?.note ?? null,
    certainty: ['provisional', 'unconfirmed', 'differential'].includes(d?.verification ?? '') ? 'suspected' : 'confirmed', data: d }
}
export function medicationOf(x: ListRowData, en: ServerEntry | undefined, types: Types): Medication {
  const d = dataOf(en, 'medication', types); const dos = d?.dosage; const atc = d?.drug.codings?.find((c) => c.system === 'atc')
  return { id: x.item, entry_id: en?.id ?? x.entry_id, version: en?.item_version ?? 1, drug_code: atc ? `atc:${atc.code}` : null, drug_name: d?.drug.text ?? '', dose_number: dos?.dose ? Number(dos.dose.value) : null,
    dose_unit: dos?.dose?.unit ?? null, route: dos?.route ?? null, frequency: dos?.timing?.code ?? (dos?.as_needed ? 'PRN' : null), prn: !!dos?.as_needed, prn_reason_text: dos?.as_needed_for ?? null,
    problem_id: d?.reasons?.[0]?.id ?? null, status: d?.status ?? x.status, started_on: x.first_at.slice(0, 10), instructions_text: d?.instructions ?? null,
    basis: d?.basis ?? 'prescribed', duration_days: d?.duration_days ?? null, data: d }
}
export function allergyOf(x: ListRowData, en: ServerEntry | undefined, types: Types): Allergy {
  const d = dataOf(en, 'allergy', types); const reactions = d?.reactions ?? []
  return { id: x.item, entry_id: en?.id ?? x.entry_id, version: en?.item_version ?? 1, substance_name: d?.concept.text ?? '', class_code: null, kind: d?.type ?? 'allergy',
    reactions_text: reactions.map((y) => y.manifestation.text).join(', ') || null, severity: reactions.find((y) => y.severity)?.severity ?? null, status: d?.clinical_status ?? x.status, certainty: d?.verification ?? null, data: d }
}
/** a list's latest review (problems, medications, allergies); when, in clinical time (the same as recorded for a live write) */
export function listReviewOf(lists: TableRead<ListRowData>, list: string, types: Types): ListReview | null {
  const e = (id: string) => lists.entries[id]
  const x = lists.rows.filter((y) => y.list === 'reviews' && dataOf(e(y.entry_id), 'list_review', types)?.list === list).sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0]
  if (!x) return null
  const en = e(x.entry_id); return { list, reviewed_at: en?.occurred_at ?? x.changed_at, reviewed_by_id: en?.author_id ?? '', outcome: dataOf(en, 'list_review', types)?.outcome ?? 'reviewed' }
}

// ── the record ──
const ACTIVE_PROBLEM = new Set(['active', 'recurrence', 'relapse'])
export function recordView(r: ServerRecord, o: Organization | undefined, departmentId: string, visitId?: string | null): RecordView {
  const lists = r.tables['base.lists'] ?? { rows: [], entries: {}, patients: {}, withheld: 0 }
  const e = (id: string) => lists.entries[id]
  const types = o?.types
  const problems: Problem[] = lists.rows.filter((x) => x.list === 'problems' && ACTIVE_PROBLEM.has(x.status)).map((x) => problemOf(x, e(x.entry_id), types))
  const medications: Medication[] = lists.rows.filter((x) => x.list === 'medications' && (x.status === 'active' || x.status === 'on-hold')).map((x) => medicationOf(x, e(x.entry_id), types))
  const allergies: Allergy[] = lists.rows.filter((x) => x.list === 'allergies').map((x) => allergyOf(x, e(x.entry_id), types))
  const review = (list: string) => listReviewOf(lists, list, types)
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
/** a search hit: the identity and where the patient is now */
export function hit(i: Identity, presence: PresenceRow[], o: Organization | undefined): PatientHit {
  return { ...banner(i), identifiers: i.identifiers.map((x) => ({ system: x.system, value: x.value })), identity: i,
    open_visits: presence.filter((p) => p.patient_id === i.id && isOpen(p)).map((p) => ({ id: p.item, department_id: p.department_id, department_name: nameOf(o, p.department_id) ?? '',
      status: STATUS[p.state] ?? 'waiting', present: presentNow(p), arrived_at: p.checked_in_at, assignee_id: p.assigned_id, row: p })) }
}
