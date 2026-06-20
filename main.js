import {
  computePresetDate,
  parseCustomDate,
  formatRelative,
  formatDisplayDate,
  buildDateStrings,
  buildGCalUrl,
  requestCurrentLocation,
} from './lib.js'
import { initInstallBanner } from './banner.js'

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner')
  banner.hidden = false
  document.getElementById('update-reload').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' })
  })
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
      .then(reg => {
        if (reg.waiting) showUpdateBanner(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(sw)
            }
          })
        })
      })
      .catch(() => {})

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
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

form.addEventListener('submit', async e => {
  e.preventDefault()

  const title = document.getElementById('title').value.trim()
  if (!title) { document.getElementById('title').focus(); return }

  const target = getTargetDate()
  if (!target) { customDateInput.focus(); return }

  const allDay = allDayCheckbox.checked
  const description = document.getElementById('description').value.trim()
  const typedLocation = document.getElementById('location').value.trim()
  const location = typedLocation || await requestCurrentLocation(navigator.geolocation)
  const startTime = document.getElementById('start-time').value
  const endTime = document.getElementById('end-time').value

  const { startStr, endStr } = buildDateStrings(target, { allDay, startTime, endTime })
  const url = buildGCalUrl({ title, startStr, endStr, description, location })

  window.open(url, '_blank')
})


updateLiveCountdown()

initInstallBanner({
  ua: navigator.userAgent,
  standalone: navigator.standalone,
  storage: localStorage,
  banner: document.getElementById('install-banner'),
  dismissBtn: document.getElementById('install-dismiss'),
})
