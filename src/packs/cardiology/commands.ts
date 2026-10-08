// Cardiology's words on the line (spec/openCare.md §5.7): /ecg and /hf where the department ticks the pack; /echo, its order word, wherever
// the Echo room (a department using the pack) works for this one. Pure: the /hf note under the card is handed in by the client.
import type { ReactNode } from 'react'
import { ordersFrom, registerCommand } from '@core/screens/visit/commands'
import { orderRequests, type Ctx, type Parsed } from '@core/screens/visit/parse'
import { parseEcg } from './ecg'
import { parseHf } from './hf'

const female = (ctx: Ctx) => ctx.record?.patient?.sex === 'female'
export function registerCommands(hfNote?: (items: Parsed[], ctx: Ctx) => ReactNode) {
  registerCommand({ name: 'ecg', pack: 'cardiology', title: 'ECG', label: 'ECG — read here, a result with no order', example: '/ecg af 108 qrs 96 qtc 452 axis 20 nad',
    action: 'write:result', writes: ['result'], parse: (rest, ctx) => rest ? parseEcg(rest, female(ctx)) : null,
    empty: (ctx) => { const r = parseEcg('sinus', female(ctx)); return r && 'ok' in r ? r.ok : [] } })
  registerCommand({ name: 'hf', pack: 'cardiology', title: 'Heart failure', label: 'Heart failure visit — NYHA, weight, dry weight', example: '/hf nyha 2 wt 71.4 oedema ankles flat · dry 70',
    action: 'write:observation', writes: ['observation', 'vitals'], parse: (rest) => parseHf(rest), ...(hfNote ? { note: hfNote } : {}) })
  // /echo: the Echo room's echo, by the start of its name, or alone with "? the question" when the Echo room has one echo
  registerCommand({ name: 'echo', pack: 'cardiology', orders: true, groupTitle: 'Cardiology', title: 'Echo', label: 'Echo — from the Echo room', example: '/echo ? lv function, new af',
    action: 'write:order', writes: ['order'], parse: (rest, ctx) => {
      if (!rest.trim()) return null
      const from = ordersFrom('cardiology', ctx); const mine = (s: Ctx['services'][number]) => from.has(s.department_id ?? '')
      const head = rest.split('?')[0].replace(/\b(urgent|stat)\b/gi, '').trim()
      const pool = ctx.services.filter((s) => s.department_id !== ctx.departmentId && mine(s))
      return orderRequests(head || pool.length !== 1 ? rest : `${pool[0].code} ${rest}`, ctx, mine, 'echo')
    } })
}
