/**
 * DictateButton — the voice-typing pill for text-heavy block editors.
 * Wraps useDictation: renders nothing where the Web Speech API is missing,
 * pulses red while listening, and surfaces mic-permission errors inline.
 * Place next to a field label and append the emitted text to that field.
 */
import { Mic, MicOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useDictation } from '../../../hooks/useDictation'

export { appendDictation } from '../../../hooks/useDictation'

export function DictateButton({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const dictation = useDictation(onText)
  if (!dictation.supported) return null
  return (
    <span className={cn('inline-flex flex-col items-end gap-0.5', className)}>
      <button
        type="button"
        onClick={dictation.toggle}
        title={dictation.listening ? 'Stop dictation' : 'Dictate'}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
          dictation.listening
            ? 'border-red-400 bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
        )}
      >
        {dictation.listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
        {dictation.listening ? 'Listening… tap to stop' : 'Dictate'}
      </button>
      {dictation.error && (
        <span className="text-[11px] text-red-600 dark:text-red-400">{dictation.error}</span>
      )}
    </span>
  )
}
