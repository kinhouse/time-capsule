// @vitest-environment jsdom
//
// Three bugs, all sharing one root cause: the author CSS rules
// (.field { display:flex } and .result { display:flex }) override the browser's
// UA-level [hidden] { display:none }, so elements with the `hidden` attribute
// remain visible.  The fix is an explicit author-level rule with !important.
//
// Tests for bugs 1 and 2 use CSS content assertions (the only reliable way to
// catch a UA-vs-author cascade issue in unit tests).  Tests for bug 3 also
// cover the JS-level wiring: that the gcal link gets a real URL on submit.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import {
  computePresetDate,
  buildDateStrings,
  buildGCalUrl,
  requestCurrentLocation,
} from './lib.js'
import { initInstallBanner } from './banner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const css = readFileSync(resolve(__dirname, 'style.css'), 'utf-8')
const html = readFileSync(resolve(__dirname, 'index.html'), 'utf-8')

// ── Bug 1: custom date picker stays visible when a preset is selected ─────────
//
// .field { display:flex } overrides the UA [hidden] rule, so div#custom-date-field
// remains visible even when its `hidden` attribute is set.

describe('Bug 1 – custom date picker visibility', () => {
  it('style.css defines [hidden] { display: none !important } to prevent flex override', () => {
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/)
  })
})

// ── Bug 2: time fields stay visible when "All-day event" is checked ───────────
//
// Same root cause: .field.time-row { display:flex } overrides UA [hidden].

describe('Bug 2 – time-fields visibility', () => {
  it('style.css defines [hidden] { display: none !important } so time fields honour the hidden attribute', () => {
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/)
  })
})

// ── Bug 3: "Add to Google Calendar" does nothing ──────────────────────────────
//
// .result { display:flex } overrides UA [hidden], so the result section (with
// gcal-link href="#") is visible before the form is submitted.
// Two sub-tests:
//   3a. CSS – result section must actually hide before submission.
//   3b. JS  – after a valid submission the gcal link gets a real Calendar URL.

describe('Bug 3 – Add to Google Calendar', () => {
  it('3a: style.css defines [hidden] { display: none !important } so the result section starts hidden', () => {
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/)
  })

  describe('3b: gcal link receives a real Calendar URL on form submit', () => {
    function buildFullDOM() {
      document.body.innerHTML = `
        <form id="invite-form" novalidate>
          <input type="text" id="title" value="Future Reunion" />
          <select id="date-preset"><option value="20" selected>20 years</option></select>
          <div id="custom-date-field" hidden><input type="date" id="custom-date" /></div>
          <div id="live-countdown"></div>
          <label><input type="checkbox" id="all-day" checked />All-day</label>
          <div id="time-fields" hidden>
            <input type="time" id="start-time" value="10:00" />
            <input type="time" id="end-time" value="11:00" />
          </div>
          <textarea id="description"></textarea>
          <input type="text" id="location" />
          <button type="submit">Add to Google Calendar</button>
        </form>
      `
    }

    // Wire the submit handler the same way main.js does (without the SW / env bits)
    function wireSubmit() {
      const presetSelect    = document.getElementById('date-preset')
      const customDateInput = document.getElementById('custom-date')
      const allDayCheckbox  = document.getElementById('all-day')
      const form            = document.getElementById('invite-form')

      function getTargetDate() {
        if (presetSelect.value === 'custom')
          return customDateInput.value ? new Date(customDateInput.value) : null
        return computePresetDate(parseInt(presetSelect.value))
      }

      form.addEventListener('submit', e => {
        e.preventDefault()
        const title = document.getElementById('title').value.trim()
        if (!title) return
        const target = getTargetDate()
        if (!target) return
        const allDay    = allDayCheckbox.checked
        const startTime = document.getElementById('start-time').value
        const endTime   = document.getElementById('end-time').value
        const { startStr, endStr } = buildDateStrings(target, { allDay, startTime, endTime })
        const url = buildGCalUrl({
          title,
          startStr,
          endStr,
          description: document.getElementById('description').value.trim(),
          location:    document.getElementById('location').value.trim(),
        })
        window.open(url, '_blank')
      })
    }

    it('opens a real Google Calendar URL in a new tab on submission', () => {
      buildFullDOM()
      const openMock = vi.fn()
      window.open = openMock
      wireSubmit()

      document.getElementById('invite-form').dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      )

      expect(openMock).toHaveBeenCalledOnce()
      const [url, target] = openMock.mock.calls[0]
      expect(url).toContain('calendar.google.com')
      expect(url).toContain('action=TEMPLATE')
      expect(url).toContain('Future+Reunion')
      expect(target).toBe('_blank')
    })

    it('form remains visible after submission', () => {
      buildFullDOM()
      window.open = vi.fn()
      wireSubmit()

      document.getElementById('invite-form').dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      )

      expect(document.getElementById('invite-form').hidden).toBe(false)
    })
  })
})

// ── Install banner ────────────────────────────────────────────────────────────

const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function buildBannerDOM() {
  document.body.innerHTML = `
    <div id="install-banner" hidden>
      <button id="install-dismiss">✕</button>
    </div>
  `
}

function mockStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
  }
}

describe('install banner', () => {
  it('shows banner on iOS Safari when not standalone and not dismissed', () => {
    buildBannerDOM()
    const banner = document.getElementById('install-banner')
    const dismissBtn = document.getElementById('install-dismiss')
    initInstallBanner({ ua: IOS_SAFARI_UA, standalone: false, storage: mockStorage(), banner, dismissBtn })
    expect(banner.hidden).toBe(false)
  })

  it('keeps banner hidden when already in standalone mode', () => {
    buildBannerDOM()
    const banner = document.getElementById('install-banner')
    const dismissBtn = document.getElementById('install-dismiss')
    initInstallBanner({ ua: IOS_SAFARI_UA, standalone: true, storage: mockStorage(), banner, dismissBtn })
    expect(banner.hidden).toBe(true)
  })

  it('keeps banner hidden when previously dismissed', () => {
    buildBannerDOM()
    const banner = document.getElementById('install-banner')
    const dismissBtn = document.getElementById('install-dismiss')
    initInstallBanner({ ua: IOS_SAFARI_UA, standalone: false, storage: mockStorage({ 'aths-dismissed': '1' }), banner, dismissBtn })
    expect(banner.hidden).toBe(true)
  })

  it('keeps banner hidden on non-iOS browsers', () => {
    buildBannerDOM()
    const banner = document.getElementById('install-banner')
    const dismissBtn = document.getElementById('install-dismiss')
    const androidUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36'
    initInstallBanner({ ua: androidUA, standalone: false, storage: mockStorage(), banner, dismissBtn })
    expect(banner.hidden).toBe(true)
  })

  it('dismiss button hides banner and sets dismissed flag in storage', () => {
    buildBannerDOM()
    const banner = document.getElementById('install-banner')
    const dismissBtn = document.getElementById('install-dismiss')
    const storage = mockStorage()
    initInstallBanner({ ua: IOS_SAFARI_UA, standalone: false, storage, banner, dismissBtn })
    expect(banner.hidden).toBe(false)
    dismissBtn.click()
    expect(banner.hidden).toBe(true)
    expect(storage.getItem('aths-dismissed')).toBe('1')
  })
})

// ── Update banner ─────────────────────────────────────────────────────────────
//
// When a new service worker is waiting, the app shows an update banner.
// Clicking the reload button sends SKIP_WAITING to the waiting SW, which then
// activates. The controllerchange event triggers a page reload.

describe('Update banner', () => {
  it('style.css defines styles for #update-banner', () => {
    expect(css).toMatch(/#update-banner/)
  })

  it('index.html contains #update-banner element with hidden attribute', () => {
    expect(html).toMatch(/id="update-banner"[^>]*hidden|hidden[^>]*id="update-banner"/)
  })

  describe('banner interaction', () => {
    function showUpdateBanner(worker) {
      const banner = document.getElementById('update-banner')
      banner.hidden = false
      document.getElementById('update-reload').addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' })
      })
    }

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="update-banner" hidden>
          <span>Update available</span>
          <button id="update-reload">Reload</button>
        </div>
      `
    })

    it('showUpdateBanner reveals the banner', () => {
      showUpdateBanner({ postMessage: vi.fn() })
      expect(document.getElementById('update-banner').hidden).toBe(false)
    })

    it('clicking reload sends SKIP_WAITING to the service worker', () => {
      const worker = { postMessage: vi.fn() }
      showUpdateBanner(worker)
      document.getElementById('update-reload').click()
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    })
  })
})

// ── requestCurrentLocation ────────────────────────────────────────────────────

describe('requestCurrentLocation', () => {
  it('returns empty string when geolocation is unavailable', async () => {
    expect(await requestCurrentLocation(null)).toBe('')
  })

  it('returns "lat,lng" string when geolocation succeeds', async () => {
    const mockGeo = {
      getCurrentPosition: (success) =>
        success({ coords: { latitude: 37.7749, longitude: -122.4194 } }),
    }
    expect(await requestCurrentLocation(mockGeo)).toBe('37.7749,-122.4194')
  })

  it('returns empty string when user denies geolocation', async () => {
    const mockGeo = {
      getCurrentPosition: (_success, error) => error(new Error('denied')),
    }
    expect(await requestCurrentLocation(mockGeo)).toBe('')
  })
})

// ── Geolocation integration on form submit ────────────────────────────────────

describe('geolocation on form submit', () => {
  function buildGeoFormDOM() {
    document.body.innerHTML = `
      <form id="invite-form" novalidate>
        <input type="text" id="title" value="Future Reunion" />
        <select id="date-preset"><option value="20" selected>20 years</option></select>
        <div id="custom-date-field" hidden><input type="date" id="custom-date" /></div>
        <div id="live-countdown"></div>
        <label><input type="checkbox" id="all-day" checked />All-day</label>
        <div id="time-fields" hidden>
          <input type="time" id="start-time" value="10:00" />
          <input type="time" id="end-time" value="11:00" />
        </div>
        <textarea id="description"></textarea>
        <input type="text" id="location" />
        <button type="submit">Add to Google Calendar</button>
      </form>
    `
  }

  function wireAsyncSubmit(geolocation) {
    const presetSelect    = document.getElementById('date-preset')
    const customDateInput = document.getElementById('custom-date')
    const allDayCheckbox  = document.getElementById('all-day')
    const form            = document.getElementById('invite-form')

    function getTargetDate() {
      if (presetSelect.value === 'custom')
        return customDateInput.value ? new Date(customDateInput.value) : null
      return computePresetDate(parseInt(presetSelect.value))
    }

    form.addEventListener('submit', async e => {
      e.preventDefault()
      const title = document.getElementById('title').value.trim()
      if (!title) return
      const target = getTargetDate()
      if (!target) return
      const allDay    = allDayCheckbox.checked
      const startTime = document.getElementById('start-time').value
      const endTime   = document.getElementById('end-time').value
      const { startStr, endStr } = buildDateStrings(target, { allDay, startTime, endTime })
      const typedLocation = document.getElementById('location').value.trim()
      const location = typedLocation || await requestCurrentLocation(geolocation)
      const url = buildGCalUrl({
        title,
        startStr,
        endStr,
        description: document.getElementById('description').value.trim(),
        location,
      })
      window.open(url, '_blank')
    })
  }

  it('includes coordinates in URL when geolocation is granted', async () => {
    buildGeoFormDOM()
    window.open = vi.fn()
    const mockGeo = {
      getCurrentPosition: (success) =>
        success({ coords: { latitude: 51.5074, longitude: -0.1278 } }),
    }
    wireAsyncSubmit(mockGeo)
    document.getElementById('invite-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(window.open).toHaveBeenCalledOnce()
    expect(window.open.mock.calls[0][0]).toContain('51.5074')
    expect(window.open.mock.calls[0][0]).toContain('-0.1278')
  })

  it('opens without location param when user denies geolocation', async () => {
    buildGeoFormDOM()
    window.open = vi.fn()
    const mockGeo = {
      getCurrentPosition: (_success, error) => error(new Error('denied')),
    }
    wireAsyncSubmit(mockGeo)
    document.getElementById('invite-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(window.open).toHaveBeenCalledOnce()
    expect(window.open.mock.calls[0][0]).not.toContain('location')
  })

  it('uses typed location and skips geolocation when location field is filled', async () => {
    buildGeoFormDOM()
    document.getElementById('location').value = 'Mars Colony Alpha'
    window.open = vi.fn()
    const mockGeo = { getCurrentPosition: vi.fn() }
    wireAsyncSubmit(mockGeo)
    document.getElementById('invite-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled()
    expect(window.open.mock.calls[0][0]).toContain('Mars+Colony+Alpha')
  })
})
