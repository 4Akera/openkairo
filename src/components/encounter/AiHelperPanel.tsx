/**
 * AiHelperPanel — chat with the local model about the CURRENT encounter.
 *
 * The chart (patient line + this encounter's blocks) is rebuilt from the
 * encounter store on every send, so the helper always sees the latest
 * state. Strictly read-only decision support: it drafts text to copy but
 * never writes to the record, and the footer says exactly that. Stays
 * mounted while the page is open so the conversation survives close/open;
 * an in-flight reply is aborted when the panel closes.
 */
import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, SendHorizonal, Loader2 } from 'lucide-react'
import { Button } from '../ui'
import { cn } from '../../lib/utils'
import { useEncounterStore } from '../../stores/encounterStore'
import { formatDateTime } from '../../lib/utils'
import { buildClinicalContext, streamChat, type ChatMessage, type ContextInput } from '../../lib/aiChat'
import { fetchPatientChartForExport } from '../../lib/encounterHtmlExport'
import { DictateButton, appendDictation } from '../timeline/blocks/DictateButton'

const SUGGESTIONS = [
  'Summarize this encounter so far',
  'Anything abnormal or missing here?',
  'Draft a referral letter from this chart',
]

/** Just enough markdown for small-model replies: **bold** and bullet lines. */
function MdLite({ text }: { text: string }) {
  const bold = (s: string, key: number) => {
    const parts = s.split(/\*\*(.+?)\*\*/g)
    return (
      <span key={key}>
        {parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
      </span>
    )
  }
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[*•-]\s+(.*)$/.exec(line)
        if (bullet) {
          return (
            <span key={i} className="flex gap-1.5">
              <span className="text-muted-foreground shrink-0">•</span>
              <span className="flex-1 min-w-0">{bold(bullet[1], i)}</span>
            </span>
          )
        }
        return <span key={i}>{bold(line, i)}{'\n'}</span>
      })}
    </>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  patientId: string
  patientLine: ContextInput['patient']
  encounterLine: ContextInput['encounter']
}

export function AiHelperPanel({ open, onClose, patientId, patientLine, encounterLine }: Props) {
  const { blocks, definitionMap } = useEncounterStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recordRef = useRef<ContextInput['record']>(undefined)

  /** Allergies / problems / meds for grounding — fetched once, retried on failure. */
  const loadRecord = async (): Promise<ContextInput['record']> => {
    if (recordRef.current) return recordRef.current
    try {
      const chart = await fetchPatientChartForExport(patientId)
      recordRef.current = {
        allergies: chart.allergies.map(a =>
          `${a.allergen}${a.severity || a.reaction ? ` (${[a.severity, a.reaction].filter(Boolean).join(' — ')})` : ''}`),
        problems: chart.problems
          .filter(p => p.status === 'active')
          .map(p => `${p.problem} (${p.importance})`),
        medications: chart.medications
          .filter(m => m.status === 'active')
          .map(m => [m.medication_name, m.dosage, m.frequency, m.route].filter(Boolean).join(' ')),
      }
      return recordRef.current
    } catch {
      return undefined // absence must not read as "no allergies" — omit the section
    }
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // Leaving the panel aborts an in-flight reply (the text so far stays)
  useEffect(() => {
    if (!open) abortRef.current?.abort()
  }, [open])
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    setError(null)
    setInput('')

    const system = buildClinicalContext({
      patient: patientLine,
      encounter: encounterLine,
      record: await loadRecord(),
      blocks: blocks.map(b => ({
        name: definitionMap[b.type]?.name ?? b.type,
        createdAt: formatDateTime(b.created_at),
        content: b.content,
      })),
    })

    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat(system, history, delta => {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta }
          return next
        })
      }, controller.signal)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The local model did not answer')
      // Drop the empty assistant stub so the thread doesn't show a blank turn
      setMessages(prev => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev))
    } finally {
      setBusy(false)
    }
  }

  const lastAssistantEmpty = busy && messages[messages.length - 1]?.content === ''

  return (
    <>
      {open && <div className="fixed inset-0 z-[95] bg-black/20" onClick={onClose} />}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 z-[100] w-full sm:w-[400px] bg-card border-l flex flex-col shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">AI Helper</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Local model · sees this encounter · writes nothing</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2 pt-4">
              <p className="text-xs text-muted-foreground">Ask about this encounter, or start with:</p>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="block w-full text-left text-xs rounded-lg border border-dashed px-3 py-2 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="text-sm whitespace-pre-wrap leading-relaxed">
                <MdLite text={m.content} />
                {i === messages.length - 1 && lastAssistantEmpty && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                  </span>
                )}
              </div>
            )
          ))}

          {error && <p className="text-xs text-red-600 dark:text-red-400 leading-snug">{error}</p>}
        </div>

        {/* Composer */}
        <div className="border-t p-3 space-y-1.5 shrink-0">
          <div className="flex items-end gap-1.5">
            <textarea
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) }
              }}
              placeholder="Ask about this patient…"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex flex-col items-end gap-1.5">
              <DictateButton onText={t => setInput(prev => appendDictation(prev, t))} />
              <Button size="sm" className="h-8" onClick={() => void send(input)} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Decision support only — verify before acting. Conversation is not saved.
          </p>
        </div>
      </div>
    </>
  )
}
