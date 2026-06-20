import {
  computePresetDate,
  parseCustomDate,
  formatRelative,
  formatDisplayDate,
  buildDateStrings,
  buildGCalUrl,
} from './lib.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

const presetSelect = document.getElementById('date-preset')
const customDateField = document.getElementById('custom-date-field')
const customDateInput = document.getElementById('custom-date')
const allDayCheckbox = document.getElementById('all-day')
const timeFields = document.getElementById('time-fields')
const form = document.getElementById('invite-form')
const liveCountdown = document.getElementById('live-countdown')

const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
customDateInput.min = tomorrow.toISOString().split('T')[0]

function getTargetDate() {
  if (presetSelect.value === 'custom') {
    return customDateInput.value ? parseCustomDate(customDateInput.value) : null
  }
  return computePresetDate(parseInt(presetSelect.value))
}

function updateLiveCountdown() {
  const target = getTargetDate()
  liveCountdown.textContent = target
    ? `${formatDisplayDate(target)} — ${formatRelative(target)} away`
    : ''
}

presetSelect.addEventListener('change', () => {
  customDateField.hidden = presetSelect.value !== 'custom'
  updateLiveCountdown()
})

customDateInput.addEventListener('input', updateLiveCountdown)

allDayCheckbox.addEventListener('change', () => {
  timeFields.hidden = allDayCheckbox.checked
})

form.addEventListener('submit', e => {
  e.preventDefault()

  const title = document.getElementById('title').value.trim()
  if (!title) { document.getElementById('title').focus(); return }

  const target = getTargetDate()
  if (!target) { customDateInput.focus(); return }

  const allDay = allDayCheckbox.checked
  const description = document.getElementById('description').value.trim()
  const location = document.getElementById('location').value.trim()
  const startTime = document.getElementById('start-time').value
  const endTime = document.getElementById('end-time').value

  const { startStr, endStr } = buildDateStrings(target, { allDay, startTime, endTime })
  const url = buildGCalUrl({ title, startStr, endStr, description, location })

  window.open(url, '_blank')
})


updateLiveCountdown()
