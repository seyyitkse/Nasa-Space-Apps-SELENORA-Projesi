/** Formatting helpers. Units are language-independent (°, h, %). */

export function formatLat(lat: number, digits = 3): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? 'S' : 'N'}`
}

export function formatLon(lon: number, digits = 3): string {
  return `${Math.abs(lon).toFixed(digits)}° ${lon < 0 ? 'W' : 'E'}`
}

export function formatCoord(lat: number, lon: number, digits = 3): string {
  return `${formatLat(lat, digits)}, ${formatLon(lon, digits)}`
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}

export function formatHours(hours: number): string {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`
  return `${hours.toFixed(1)} h`
}

const utcFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const utcDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatUtc(iso: string | number | Date): string {
  return `${utcFmt.format(new Date(iso))} UTC`
}

export function formatUtcDate(iso: string | number | Date): string {
  return utcDateFmt.format(new Date(iso))
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}
