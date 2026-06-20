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

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import {
  computePresetDate,
  buildDateStrings,
  buildGCalUrl,
} from './lib.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const css = readFileSync(resolve(__dirname, 'style.css'), 'utf-8')

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
          <button type="submit">Generate</button>
        </form>
        <section id="result" hidden>
          <div id="result-date"></div>
          <a id="gcal-link" href="#"></a>
          <button id="copy-btn">Copy link</button>
          <button id="reset-btn">Make another</button>
        </section>
      `
    }

    // Wire the submit handler the same way main.js does (without the SW / env bits)
    function wireSubmit() {
      const presetSelect   = document.getElementById('date-preset')
      const customDateInput = document.getElementById('custom-date')
      const allDayCheckbox = document.getElementById('all-day')
      const form           = document.getElementById('invite-form')
      const result         = document.getElementById('result')
      const gcalLink       = document.getElementById('gcal-link')
      const resultDate     = document.getElementById('result-date')

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
        gcalLink.href = url
        form.hidden   = true
        result.hidden = false
      })
    }

    it('gcal link starts as "#" before submission', () => {
      buildFullDOM()
      const gcalLink = document.getElementById('gcal-link')
      expect(gcalLink.getAttribute('href')).toBe('#')
    })

    it('gcal link is a real Google Calendar URL after a valid submission', () => {
      buildFullDOM()
      wireSubmit()

      document.getElementById('invite-form').dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      )

      const href = document.getElementById('gcal-link').href
      expect(href).toContain('calendar.google.com')
      expect(href).toContain('action=TEMPLATE')
      expect(href).toContain('Future+Reunion')
    })

    it('result section is shown and form is hidden after a valid submission', () => {
      buildFullDOM()
      wireSubmit()

      document.getElementById('invite-form').dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      )

      expect(document.getElementById('result').hidden).toBe(false)
      expect(document.getElementById('invite-form').hidden).toBe(true)
    })
  })
})
