import type { Usage } from '../types'

import { clamp, money, number, resetIn } from './format'

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

const STYLE = `<style>
  text { font-family: ${FONT}; }
  .bg { fill: #faf9f5; stroke: #e6e1d8; }
  .t { fill: #1f1e1d; } .m { fill: #73706a; }
  .card { fill: #ffffff; stroke: #e6e1d8; }
  .track { fill: #ebe6dd; } .fill { fill: #d97757; } .hot { fill: #c0453a; }
  .ring-track { stroke: #e6e1d8; } .ring { stroke: #d97757; } .ring-hot { stroke: #c0453a; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #1f1e1d; stroke: #3f3e3b; }
    .t { fill: #f5f4ef; } .m { fill: #a6a39b; }
    .card { fill: #30302e; stroke: #3f3e3b; }
    .track { fill: #3f3e3b; } .ring-track { stroke: #3f3e3b; }
  }
</style>`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const isHot = (percent: number) => percent >= 80

type Meter = { label: string; percent: number | null; detail: string }

const meters = (u: Usage, now: number): Meter[] => {
  const list: Meter[] = [
    {
      label: 'Ventana 5 h',
      percent: u.fiveHour?.percentUsed ?? null,
      detail: u.fiveHour ? `reset ${resetIn(u.fiveHour.resetsAt, now)}` : '',
    },
    {
      label: 'Ventana 7 d',
      percent: u.sevenDay?.percentUsed ?? null,
      detail: u.sevenDay ? `reset ${resetIn(u.sevenDay.resetsAt, now)}` : '',
    },
    {
      label: 'Contexto',
      percent: u.context?.percent ?? null,
      detail:
        u.context && u.context.tokens !== null
          ? `${number(u.context.tokens / 1000)}k / ${number(u.context.window / 1000)}k tokens`
          : 'sin datos',
    },
  ]

  if (u.ram !== null) {
    list.push({
      label: 'RAM usada',
      percent: (u.ram.usedGiB / u.ram.totalGiB) * 100,
      detail: `${number(u.ram.usedGiB)} / ${number(u.ram.totalGiB)} GiB`,
    })
  }

  return list
}

/** The "Consumo" pane: two cards and one bar per meter. */
export const paneSvg = (u: Usage, now: number) => {
  const W = 420
  const cardW = (W - 12) / 2
  const parts: string[] = []

  parts.push(`<text class="t" x="0" y="26" font-size="20" font-weight="700">Consumo</text>`)
  parts.push(`<text class="m" x="${W}" y="26" font-size="13" text-anchor="end">sesión actual</text>`)

  const card = (x: number, label: string, value: string) => {
    parts.push(`<rect class="card" x="${x + 0.5}" y="44.5" width="${cardW - 1}" height="76" rx="12"/>`)
    parts.push(`<text class="m" x="${x + 16}" y="70" font-size="13">${esc(label)}</text>`)
    parts.push(`<text class="t" x="${x + 16}" y="104" font-size="26" font-weight="700">${esc(value)}</text>`)
  }
  card(0, 'Coste sesión', u.cost === null ? '—' : money(u.cost))
  card(cardW + 12, 'Contexto', u.context?.percent == null ? '—' : `${u.context.percent}%`)

  let y = 152
  for (const meter of meters(u, now)) {
    const percent = clamp(meter.percent)
    const fillW = percent === 0 ? 0 : Math.max(8, (W * percent) / 100)
    parts.push(`<text class="t" x="0" y="${y}" font-size="14">${esc(meter.label)}</text>`)
    parts.push(
      `<text class="t" x="${W}" y="${y}" font-size="14" text-anchor="end">${meter.percent === null ? '—' : `${number(percent)}%`}</text>`,
    )
    parts.push(`<rect class="track" x="0" y="${y + 9}" width="${W}" height="8" rx="4"/>`)
    if (fillW > 0) {
      parts.push(`<rect class="${isHot(percent) ? 'hot' : 'fill'}" x="0" y="${y + 9}" width="${fillW}" height="8" rx="4"/>`)
    }
    if (meter.detail !== '') {
      parts.push(`<text class="m" x="0" y="${y + 34}" font-size="12">${esc(meter.detail)}</text>`)
      y += 58
    } else {
      y += 42
    }
  }

  const PAD = 20
  const outerW = W + PAD * 2
  const outerH = y - 20 + PAD * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${outerH}" viewBox="0 0 ${outerW} ${outerH}">${STYLE}<rect class="bg" x="0.5" y="0.5" width="${outerW - 1}" height="${outerH - 1}" rx="16"/><g transform="translate(${PAD} ${PAD})">${parts.join('')}</g></svg>`
}

/** The band above the prompt: a ring per meter, then the session cost. */
export const bandSvg = (u: Usage, now: number) => {
  const H = 36
  const R = 11
  const C = 2 * Math.PI * R
  const parts: string[] = []
  let x = 12

  // The band drops the window names: each ring reads "9% · reset 4 h 14".
  const short: Meter[] = meters(u, now).map(m => ({
    ...m,
    label: m.label.startsWith('Ventana ') ? '' : m.label.replace('RAM usada', 'RAM'),
    detail: m.detail.replace(' tokens', ''),
  }))

  for (const meter of short) {
    const percent = clamp(meter.percent)
    const cx = x + R + 2
    const cy = H / 2
    parts.push(`<circle class="ring-track" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke-width="4"/>`)
    if (percent > 0) {
      parts.push(
        `<circle class="${isHot(percent) ? 'ring-hot' : 'ring'}" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(C * percent) / 100} ${C}" transform="rotate(-90 ${cx} ${cy})"/>`,
      )
    }
    const value = meter.percent === null ? '—' : `${number(percent)}%`
    const head = meter.label === '' ? value : `${meter.label} ${value}`
    const tail = meter.detail === '' ? '' : ` · ${meter.detail}`
    const tx = cx + R + 8
    parts.push(
      `<text x="${tx}" y="${cy + 4.5}" font-size="13"><tspan class="t" font-weight="600">${esc(head)}</tspan><tspan class="m">${esc(tail)}</tspan></text>`,
    )
    x = tx + head.length * 7.4 + tail.length * 6.3 + 16
  }

  if (u.cost !== null) {
    parts.push(
      `<text x="${x}" y="${H / 2 + 4.5}" font-size="13"><tspan class="m">Coste </tspan><tspan class="t" font-weight="600">${esc(money(u.cost))}</tspan></text>`,
    )
    x += 110
  }

  const W = Math.ceil(x)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}<rect class="bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${H / 2}"/>${parts.join('')}</svg>`
}

export const altText = (u: Usage, now: number) =>
  meters(u, now)
    .map(m => `${m.label}: ${m.percent === null ? 'sin datos' : `${number(clamp(m.percent))}%`}${m.detail === '' ? '' : `, ${m.detail}`}`)
    .concat(u.cost === null ? [] : [`Coste sesión: ${money(u.cost)}`])
    .join('. ')
