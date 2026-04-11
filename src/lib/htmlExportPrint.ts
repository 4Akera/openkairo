/**
 * Write HTML into an existing window and open the print dialog (Save as PDF).
 */
export function writeHtmlToWindowAndPrint(w: Window, html: string): void {
  w.document.open()
  w.document.write(html)
  w.document.close()

  const runPrint = () => {
    try {
      w.focus()
      w.print()
    } catch {
      // ignore
    }
  }

  if (w.document.readyState === 'complete') {
    setTimeout(runPrint, 400)
  } else {
    w.addEventListener('load', () => setTimeout(runPrint, 400), { once: true })
  }
}

/**
 * Sync path: open a new tab and print (works when called directly from a click handler).
 */
export function openHtmlForPrint(html: string): void {
  const w = window.open('', '_blank')
  if (!w) return
  writeHtmlToWindowAndPrint(w, html)
}
