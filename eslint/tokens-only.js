// eslint/tokens-only.js — openCare design system (design-system.md §6.1): screens and packs use the tokens and the kit, never
// raw colours. Off in src/core/ui (the kit owns the recipes); styles.css is not linted. One rule, four checks, one message each.
// A warning while the screens are swept to tokens (build plan step 2), an error from step 4. It checks every string and template
// literal (className, cn(), tone maps) and reports the first problem of each, so it counts strings, not classes.
const PALETTE = /(?:^|[\s"'`{(])(?:[\w-]+(?:-\[[^\]]*\])?:)*-?(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|divide|outline|decoration|placeholder|fill|stroke|from|via|to|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?(?=$|[\s"'`})])/
const ARBITRARY_COLOR = /(?:^|\s)(?:[\w-]+:)*[\w-]+-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|var\(--color-)/
const OFF_SCALE = /(?:^|\s)(?:[\w-]+:)*(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|text-\[\d[^\]]*\]|rounded|rounded-(?:xs|2xl|3xl|4xl)|shadow|shadow-(?:2xs|lg|xl|2xl)|z-\d+)(?=$|\s)/
const DARK = /(?:^|\s)(?:[\w-]+:)*dark:/
const COLOR_PROPS = new Set(['color', 'background', 'backgroundColor', 'borderColor', 'outlineColor', 'fill', 'stroke', 'boxShadow', 'caretColor', 'textDecorationColor'])
const OK_VALUE = /^(?:var\(--[\w-]+\)|currentColor|transparent|inherit|none|)$/
// a string that reads as a class list: lowercase utility-shaped words, at least one with a dash
const classy = (s) => { const w = s.trim().split(/\s+/); return w.length > 0 && w.every((x) => /^[a-z0-9:\-[\]/.%_()#,'&>*@!=]+$/.test(x)) && w.some((x) => x.includes('-')) }

export default {
  meta: { type: 'problem', docs: { description: 'tokens and kit only: no raw palette, hex, off-scale sizes or dark: outside src/core/ui' },
    messages: {
      palette: 'Raw palette class "{{hit}}": use a token (bg-surface, text-muted, text-danger, bg-accent-soft …) or a kit component. See /design.',
      color: 'A literal colour "{{hit}}": colours come from the tokens (var(--accent), bg-warn-soft …). See /design.',
      scale: 'Off-scale class "{{hit}}": sizes are text-11 12 13 14 16 18 22, radii rounded-sm/md/lg/xl, shadows xs/sm/md, layers z-raised/sticky/popover/overlay/toast.',
      dark: '"{{hit}}": the tokens already switch with the theme; if a screen needs dark:, the kit is missing a token.' } },
  create(context) {
    const check = (node, s) => {
      if (!s) return
      const p = s.match(PALETTE); if (p) return context.report({ node, messageId: 'palette', data: { hit: p[0].trim().replace(/^["'`{(]/, '') } })
      const a = s.match(ARBITRARY_COLOR); if (a) return context.report({ node, messageId: 'color', data: { hit: a[0].trim() } })
      if (!classy(s)) return
      const o = s.match(OFF_SCALE); if (o) return context.report({ node, messageId: 'scale', data: { hit: o[0].trim() } })
      const d = s.match(DARK); if (d) return context.report({ node, messageId: 'dark', data: { hit: d[0].trim() } })
    }
    const literalColor = (node, v) => { if (typeof v === 'string' && !OK_VALUE.test(v.trim())) context.report({ node, messageId: 'color', data: { hit: v } }) }
    return {
      Literal(node) { if (typeof node.value === 'string') check(node, node.value) },
      TemplateElement(node) { check(node, node.value.cooked ?? node.value.raw) },
      // style={{ color: '#b00' }} and <path fill="#b00">
      'JSXAttribute[name.name="style"] Property'(node) { if (COLOR_PROPS.has(node.key.name ?? node.key.value) && node.value.type === 'Literal') literalColor(node.value, node.value.value) },
      'JSXAttribute[name.name=/^(fill|stroke|color|stopColor|floodColor)$/] > Literal'(node) { literalColor(node, node.value) },
    }
  },
}
