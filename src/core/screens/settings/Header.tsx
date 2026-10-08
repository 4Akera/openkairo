// Settings → Organization → Printouts: the clinic's header on every printout (spec §3.13 Printing, the owner's (p3), 2026-10-08) — its
// name, logo, address, phone and tax number, the core's setting organization.header, as one card with its own Save. The logo is made
// small here before it is kept (at most 600 × 200 pixels, a PNG), since the setting carries it to every screen; the preview is the
// header as a receipt draws it.
import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { writeSetting } from '../../db/rpc'
import type { Organization } from '../../db/types'
import type { SettingData } from '../../db/shapes.generated'
import { headerOf, logoOk, LOGO_KINDS, LOGO_MAX } from '../../print/header'
import { PrintHeader } from '../../print/parts'
import { Button, Field, Input, SaveState, errorText } from '../../ui'
import { useSave } from './save'

type Header = SettingData['organization.header']
/** a picture made small: at most 600 × 200 pixels, kept as a PNG data: URI */
async function shrink(file: File): Promise<string> {
  const url = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(file) })
  const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Not a picture')); i.src = url })
  const k = Math.min(1, 600 / img.width, 200 / img.height)
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

export function ClinicHeaderSetting({ org }: { org: Organization }) {
  const saved = headerOf(org)
  const start = { name: saved.name, logo: saved.logo ?? '', address: saved.address ?? '', phone: saved.phone ?? '', tax_number: saved.tax_number ?? '' }
  const [h, setH] = useState(start); const [problem, setProblem] = useState<string | null>(null)
  const save = useSave((d: Header) => writeSetting({ key: 'organization.header', data: d }))
  const dirty = JSON.stringify(h) !== JSON.stringify(start)
  const set = (p: Partial<typeof h>) => { setH({ ...h, ...p }); setProblem(null) }
  const pick = async (f: File | undefined) => {
    if (!f) return
    if (!LOGO_KINDS.includes(f.type)) { setProblem('A PNG, JPEG or WebP picture'); return }
    try { const uri = await shrink(f); if (logoOk(uri)) set({ logo: uri }); else setProblem(`Too large even made small (at most ${LOGO_MAX.toLocaleString('en')} characters): a simpler picture`) }
    catch (x) { setProblem(errorText(x)) }
  }
  const data = (): Header => ({ name: h.name.trim(), ...(h.logo ? { logo: h.logo } : {}), ...(h.address.trim() ? { address: h.address.trim() } : {}),
    ...(h.phone.trim() ? { phone: h.phone.trim() } : {}), ...(h.tax_number.trim() ? { tax_number: h.tax_number.trim() } : {}) })
  return <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
    <div className="grid gap-3">
      <Field label="Name on printouts"><Input value={h.name} dir="auto" onChange={(e) => set({ name: e.target.value })} maxLength={120} /></Field>
      <Field label="Address"><Input value={h.address} dir="auto" onChange={(e) => set({ address: e.target.value })} maxLength={300} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone"><Input value={h.phone} dir="ltr" onChange={(e) => set({ phone: e.target.value })} maxLength={60} /></Field>
        <Field label="Tax number"><Input value={h.tax_number} dir="ltr" onChange={(e) => set({ tax_number: e.target.value })} maxLength={60} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-12 font-medium text-fg shadow-xs hover:bg-hover focus-within:outline-2 focus-within:outline-focus">
          <ImagePlus aria-hidden className="size-3.5" />{h.logo ? 'Another logo' : 'Logo'}
          <input type="file" accept={LOGO_KINDS.join(',')} className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} /></label>
        {h.logo && <Button size="sm" variant="ghost" onClick={() => set({ logo: '' })}><X />No logo</Button>}
        <span className="ms-auto flex items-center gap-2">
          {save.error ? <span className="text-12 text-danger">{errorText(save.error)}</span> : dirty ? <SaveState state="unsaved" /> : save.isSuccess ? <SaveState state="saved" /> : null}
          {dirty && <Button size="sm" variant="ghost" onClick={() => { setH(start); setProblem(null) }}>Undo</Button>}
          <Button size="sm" disabled={!dirty || !h.name.trim()} loading={save.isPending} onClick={() => save.mutate(data())}>Save</Button></span>
      </div>
      {problem && <p role="alert" className="text-12 text-danger">{problem}</p>}
    </div>
    <div className="grid content-start gap-1"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">On a receipt</p>
      <div data-theme="light" className="rounded-lg border border-line bg-paper p-3 text-fg" style={{ fontSize: '9pt' }}>
        <PrintHeader header={{ name: h.name.trim() || saved.name, logo: h.logo || null, address: h.address.trim() || null, phone: h.phone.trim() || null, tax_number: h.tax_number.trim() || null }} />
      </div></div>
  </div>
}
