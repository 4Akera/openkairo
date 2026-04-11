import { useState, useEffect } from 'react'
import { X, ZoomIn } from 'lucide-react'

const STORAGE_KEY = 'zoom_hint_dismissed'

export default function ZoomHintBanner() {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches
    if (isDesktop && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    setLeaving(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }, 250)
  }

  if (!visible) return null

  return (
    <>
      {/* Backdrop dim */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={dismiss}
        style={{ animation: leaving ? 'fadeOut 0.25s forwards' : 'fadeIn 0.2s forwards' }}
      />

      {/* Banner */}
      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-primary text-primary-foreground shadow-2xl"
        style={{ animation: leaving ? 'slideDown 0.25s forwards' : 'slideUp 0.3s forwards' }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <ZoomIn className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base leading-tight">Better with 150% zoom</p>
                <p className="mt-0.5 text-sm text-primary-foreground/75">This app is designed for higher zoom</p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-lg p-1.5 hover:bg-white/15 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-sm">
            Press{' '}
            <kbd className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-xs font-semibold">⌘</kbd>
            {' + '}
            <kbd className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-xs font-semibold">+</kbd>
            {' '}a few times until the browser shows <span className="font-semibold">150%</span>.
          </div>

          <button
            onClick={dismiss}
            className="mt-3 w-full rounded-xl bg-white/15 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateX(-50%) translateY(24px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
        @keyframes slideDown { from { opacity: 1; transform: translateX(-50%) translateY(0) } to { opacity: 0; transform: translateX(-50%) translateY(24px) } }
      `}</style>
    </>
  )
}
