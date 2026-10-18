const rupeeFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function formatMoney(amount) {
  return rupeeFormatter.format(amount ?? 0)
}

// "2026-11-14" -> "14 Nov 2026". Date-only strings are read as UTC so the day never shifts.
export function formatDate(value) {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined })
}

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 3 days 4 hours -> "3d 4h"; under a day -> "5h 10m"; under an hour -> "12m"
export function formatAge(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '-'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// "5 minutes ago", "2 days ago"
export function formatRelative(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const steps = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

// Waits for a pause in calls: used so a burst of live events causes one refetch
export function debounce(callback, milliseconds) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => callback(...args), milliseconds)
  }
}
