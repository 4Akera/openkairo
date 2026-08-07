import { useEffect, useState } from 'react'

/**
 * Current timestamp, refreshed every `intervalMs` (default 60s).
 * Use instead of calling Date.now() during render so relative
 * times ("5m ago") stay fresh while the page is open.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
