// Pure business logic — no DOM dependencies

export function computePresetDate(years, now = new Date()) {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() + years)
  return d
}

export function parseCustomDate(dateString) {
  // Parse as local date to avoid UTC-offset shifting the day
  const [y, m, d] = dateString.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function padDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function formatRelative(date, now = new Date()) {
  const msPerDay = 86_400_000
  const totalDays = Math.floor((date - now) / msPerDay)
  if (totalDays <= 0) return 'That date has already passed'

  const years = Math.floor(totalDays / 365.25)
  const leftoverDays = totalDays - Math.floor(years * 365.25)
  const months = Math.floor(leftoverDays / 30.44)
  const days = Math.floor(leftoverDays - months * 30.44)

  const parts = []
  if (years) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
  if (months) parts.push(`${months} month${months !== 1 ? 's' : ''}`)
  if (days || !parts.length) parts.push(`${days} day${days !== 1 ? 's' : ''}`)

  return parts.join(', ')
}

export function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function buildDateStrings(date, { allDay, startTime, endTime }) {
  if (allDay) {
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    return { startStr: padDate(date), endStr: padDate(next) }
  }
  const base = padDate(date)
  const [sh, sm] = startTime.split(':')
  const [eh, em] = endTime.split(':')
  return {
    startStr: `${base}T${sh.padStart(2, '0')}${sm.padStart(2, '0')}00`,
    endStr: `${base}T${eh.padStart(2, '0')}${em.padStart(2, '0')}00`,
  }
}

export function isIosSafari(ua) {
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

export function buildGCalUrl({ title, startStr, endStr, description, location }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStr}/${endStr}`,
  })
  if (description) params.set('details', description)
  if (location) params.set('location', location)
  return `https://calendar.google.com/calendar/render?${params}`
}
