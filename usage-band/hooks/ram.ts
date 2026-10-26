import type { RamFigures } from '../types'

/** Runs a host command by its argument vector; rejects when it cannot start. */
export type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string }>

/** Reads a file's text; rejects when it is missing. */
export type Read = (path: string) => Promise<string>

type Platform = 'macos' | 'linux' | 'windows' | 'unknown'

const GIB = 1024 ** 3

const attempt = async <T>(work: () => Promise<T>): Promise<T | null> => {
  try {
    return await work()
  } catch {
    return null
  }
}

const figures = (usedBytes: number, totalBytes: number): RamFigures | null =>
  totalBytes > 0 && usedBytes >= 0
    ? { usedGiB: usedBytes / GIB, totalGiB: totalBytes / GIB }
    : null

/**
 * macOS: memory used as Activity Monitor counts it, app memory (anonymous
 * pages less purgeable ones) + wired + what the compressor occupies. File
 * cache and inactive pages are reclaimable, so they are not "used".
 */
const fromMacos = async (run: Run) => {
  const total = await run(['sysctl', '-n', 'hw.memsize'])
  const vm = await run(['vm_stat'])
  const pageSize = Number(/page size of (\d+) bytes/.exec(vm.stdout)?.[1] ?? 0)
  if (total.exitCode !== 0 || vm.exitCode !== 0 || pageSize === 0) return null

  const pages = (label: string) =>
    Number(new RegExp(`${label}:\\s+(\\d+)`).exec(vm.stdout)?.[1] ?? 0)
  const usedPages =
    pages('Anonymous pages') -
    pages('Pages purgeable') +
    pages('Pages wired down') +
    pages('Pages occupied by compressor')

  return figures(usedPages * pageSize, Number(total.stdout))
}

/** Linux: total less what the kernel says is available, as `free` reports it. */
const fromLinux = async (read: Read, run: Run) => {
  const text =
    (await attempt(() => read('/proc/meminfo'))) ??
    (await attempt(async () => (await run(['cat', '/proc/meminfo'])).stdout))
  if (text === null) return null

  const kib = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? NaN)
  const total = kib('MemTotal')
  const available = Number.isNaN(kib('MemAvailable'))
    ? kib('MemFree') + kib('Buffers') + kib('Cached')
    : kib('MemAvailable')
  if (Number.isNaN(total) || Number.isNaN(available)) return null

  return figures((total - available) * 1024, total * 1024)
}

/**
 * Windows: total less available bytes, as Task Manager's "In use". Read
 * through CIM classes, whose names are not translated like counter paths.
 */
const fromWindows = async (run: Run) => {
  const script =
    '$t = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; ' +
    '$a = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableBytes; ' +
    '"$t $a"'

  for (const shell of ['powershell', 'pwsh']) {
    const ran = await attempt(() => run([shell, '-NoProfile', '-NonInteractive', '-Command', script]))
    if (ran === null || ran.exitCode !== 0) continue

    const [total, available] = ran.stdout.trim().split(/\s+/).map(Number)
    if (total > 0 && available >= 0) return figures(total - available, total)
  }

  return null
}

/** Finds the operating system once, by which way of reading memory works. */
const detect = async (read: Read, run: Run): Promise<Platform> => {
  if ((await attempt(() => fromMacos(run))) != null) return 'macos'
  if ((await attempt(() => fromLinux(read, run))) != null) return 'linux'
  if ((await attempt(() => fromWindows(run))) != null) return 'windows'

  return 'unknown'
}

let platform: Platform | null = null

/** Memory in use on this machine, or null where no reading works. */
export const readRam = async (read: Read, run: Run): Promise<RamFigures | null> => {
  platform ??= await detect(read, run)

  switch (platform) {
    case 'macos':
      return attempt(() => fromMacos(run))
    case 'linux':
      return attempt(() => fromLinux(read, run))
    case 'windows':
      return attempt(() => fromWindows(run))
    case 'unknown':
      return null
  }
}
