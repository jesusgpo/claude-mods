export const number = (n: number) =>
  n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

export const money = (usd: number) => `$${usd.toFixed(3)}`

export const resetIn = (resetsAt: string | null, now: number) => {
  if (resetsAt === null) return '—'

  const ms = Date.parse(resetsAt) - now
  if (ms <= 0) return 'ahora'

  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)} d`

  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export const clamp = (percent: number | null) =>
  Math.max(0, Math.min(100, percent ?? 0))
