/**
 * aiChat — the encounter's local AI helper.
 *
 * Chat over the CURRENT encounter with the same local model that powers
 * fill-from-text (openkairo.localAi config → Ollama by default). The chart
 * context is built client-side and sent with every request; PHI never
 * leaves the machine. The helper is read-only decision support: it can
 * draft text for the clinician to copy, but nothing it says is written to
 * the record.
 *
 * Context budget: Ollama's default context window is small (~4k tokens),
 * so the chart serialization is compact — empty values stripped, one line
 * per block, hard caps per block and overall — and the chat history sent
 * is trimmed to the most recent turns.
 */
import type { LocalAiConfig } from './aiExtract'
import { loadLocalAiConfig } from './aiExtract'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Chart serialization ──────────────────────────────────────────────────────

/** Recursively drop null/''/[]/{} values so serialized blocks spend tokens on facts. */
export function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const arr = value.map(stripEmpty).filter(v => v !== undefined)
    return arr.length > 0 ? arr : undefined
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const s = stripEmpty(v)
      if (s !== undefined) out[k] = s
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  if (value === null || value === '' || value === undefined) return undefined
  return value
}

const PER_BLOCK_CHARS = 1200
const CHART_CHARS = 6000

export interface ContextBlock {
  name: string
  createdAt: string
  content: unknown
}

export interface ContextInput {
  patient: { name: string; age: string | null; gender: string | null; mrn: string }
  encounter: { title: string | null; reason: string | null; status: string }
  /** Pre-formatted patient-record lines; omitted when the record fetch failed
   *  (absence of data must not read as "no allergies"). */
  record?: { allergies: string[]; problems: string[]; medications: string[] }
  blocks: ContextBlock[]
}

export function buildClinicalContext(input: ContextInput): string {
  const { patient, encounter, record, blocks } = input

  const headLines = [
    `Patient: ${patient.name} (MRN ${patient.mrn})${patient.age ? `, ${patient.age}` : ''}${patient.gender ? `, ${patient.gender}` : ''}`,
    `Encounter: ${encounter.title || 'Untitled'}${encounter.reason ? ` — reason: ${encounter.reason}` : ''} (${encounter.status})`,
  ]
  if (record) {
    headLines.push(`Allergies: ${record.allergies.length > 0 ? record.allergies.join('; ') : 'none recorded'}`)
    headLines.push(`Active problems: ${record.problems.length > 0 ? record.problems.join('; ') : 'none recorded'}`)
    headLines.push(`Active medications: ${record.medications.length > 0 ? record.medications.join('; ') : 'none recorded'}`)
  }
  const head = headLines.join('\n')

  const lines: string[] = []
  let used = 0
  let omitted = 0
  // Newest last so the freshest blocks survive the cap
  for (const b of blocks) {
    const compact = stripEmpty(b.content)
    let body = compact === undefined ? '(empty)' : JSON.stringify(compact)
    if (body.length > PER_BLOCK_CHARS) body = body.slice(0, PER_BLOCK_CHARS) + '…'
    const line = `— ${b.name} (${b.createdAt}): ${body}`
    if (used + line.length > CHART_CHARS) { omitted += 1; continue }
    used += line.length
    lines.push(line)
  }
  if (omitted > 0) lines.push(`(…${omitted} more block${omitted === 1 ? '' : 's'} omitted for space)`)

  return (
    'You are the AI helper inside OpenKairo, an EHR. You run LOCALLY in the clinic and are looking at ONE encounter with the clinician.\n' +
    'Rules: use ONLY the chart below for patient facts and say plainly when something is not in the chart. Be concise and practical. ' +
    'You cannot write to the record — when asked to draft (a letter, a summary, an instruction sheet), produce text the clinician can copy. ' +
    'You are decision support, not the decision: flag uncertainty, and tell the clinician to verify doses and interactions against a reference.\n\n' +
    'CHART\n' + head + (lines.length > 0 ? '\n' + lines.join('\n') : '\n(no blocks yet)')
  )
}

// ─── Streaming completion (OpenAI-compatible SSE) ─────────────────────────────

/** Parse one SSE line from a chat-completions stream → text delta, or null. */
export function parseSseDelta(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    const obj = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
    return obj.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}

/** Most recent turns that fit the small local context window. */
export const HISTORY_TURNS = 8

export async function streamChat(
  systemPrompt: string,
  history: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  cfg?: LocalAiConfig,
): Promise<void> {
  const { baseUrl, model } = cfg ?? loadLocalAiConfig()

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-HISTORY_TURNS),
        ],
      }),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw new Error(`Local AI not reachable at ${baseUrl} — is Ollama running? (ollama serve)`)
  }

  if (!res.ok || !res.body) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } | string }
      detail = typeof body.error === 'string' ? body.error : body.error?.message ?? ''
    } catch { /* non-JSON error body */ }
    throw new Error(`Local AI error (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const delta = parseSseDelta(line)
        if (delta) onDelta(delta)
      }
    }
    const tail = parseSseDelta(buffer)
    if (tail) onDelta(tail)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  }
}
